import { Octokit } from '@octokit/rest';
import axios, { AxiosInstance } from 'axios';
import { AssigneeMapping, SyncConfig } from '../types';
import { BrowserService } from './browser';
import inquirer from 'inquirer';

interface PlaneUser {
  id: string;
  display_name: string;
  email?: string;
}

interface GitHubUser {
  login: string;
  email?: string;
  name?: string;
}

export class AssigneeService {
  private octokit: Octokit;
  private planeClient: AxiosInstance;
  private browserService: BrowserService;
  private owner: string;
  private workspaceSlug: string;

  constructor(
    githubToken: string,
    planeApiKey: string,
    planeBaseUrl: string,
    owner: string,
    workspaceSlug: string,
    planeEmail: string,
    planePassword: string,
    projectSlug: string
  ) {
    this.octokit = new Octokit({ auth: githubToken });
    this.planeClient = axios.create({
      baseURL: planeBaseUrl.endsWith('/') ? planeBaseUrl + 'api/v1' : planeBaseUrl + '/api/v1',
      headers: {
        'X-API-Key': planeApiKey,
        'Content-Type': 'application/json'
      }
    });
    this.browserService = new BrowserService(
      planeEmail,
      planePassword,
      planeBaseUrl,
      workspaceSlug,
      projectSlug
    );
    this.owner = owner;
    this.workspaceSlug = workspaceSlug;
  }

  private async getGitHubUsers(): Promise<GitHubUser[]> {
    try {
      const { data: members } = await this.octokit.orgs.listMembers({
        org: this.owner,
        per_page: 100
      });

      const detailedUsers: GitHubUser[] = [];

      for (const member of members) {
        try {
          const { data: details } = await this.octokit.users.getByUsername({
            username: member.login
          });
          detailedUsers.push({
            login: member.login,
            email: details.email || undefined,
            name: details.name || undefined
          });
        } catch (error) {
          console.warn(`Could not fetch details for GitHub user ${member.login}`);
        }
      }

      return detailedUsers;
    } catch (error) {
      console.error('Error fetching GitHub organization members:', error);
      throw error;
    }
  }

  private async getPlaneUsers(): Promise<PlaneUser[]> {
    try {
      const members = await this.browserService.getWorkspaceMembers();
      return members.map(member => ({
        id: member.member_id,
        display_name: member.member__display_name,
        email: undefined
      }));
    } catch (error) {
      console.error('Error fetching Plane users:', error);
      throw error;
    }
  }

  private findBestMatch(
    githubUser: GitHubUser,
    planeUsers: PlaneUser[],
    existingMappings: AssigneeMapping[]
  ): PlaneUser | null {
    // First check if there's an existing mapping
    const existingMapping = existingMappings.find(m => m.githubUsername === githubUser.login);
    if (existingMapping) {
      const matchedUser = planeUsers.find(u => u.id === existingMapping.planeUserId);
      if (matchedUser) return matchedUser;
    }

    // Try to match by login/display_name first (most reliable)
    const loginMatch = planeUsers.find(u => {
      const planeDisplayName = u.display_name.toLowerCase().trim();
      const githubLogin = githubUser.login.toLowerCase().trim();
      return planeDisplayName === githubLogin ||
             planeDisplayName.includes(githubLogin) ||
             githubLogin.includes(planeDisplayName);
    });
    if (loginMatch) return loginMatch;

    // Try to match by name if available
    if (githubUser.name) {
      const githubName = githubUser.name.toLowerCase().trim();
      const nameMatch = planeUsers.find(u => {
        const planeName = u.display_name.toLowerCase().trim();
        return githubName.includes(planeName) || planeName.includes(githubName);
      });
      if (nameMatch) return nameMatch;
    }

    return null;
  }

  private async promptForManualMapping(
    githubUser: GitHubUser,
    planeUsers: PlaneUser[]
  ): Promise<PlaneUser | null> {
    console.log(`\nNo automatic match found for GitHub user: ${githubUser.login}`);
    if (githubUser.name) {
      console.log(`GitHub Name: ${githubUser.name}`);
    }
    console.log('\nAvailable Plane users:');
    planeUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.display_name}`);
    });
    console.log('\n0. Skip this user');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'selection',
        message: 'Enter the number of the Plane user to map to (or 0 to skip):',
        validate: (input: string) => {
          const num = parseInt(input);
          if (isNaN(num) || num < 0 || num > planeUsers.length) {
            return `Please enter a number between 0 and ${planeUsers.length}`;
          }
          return true;
        }
      }
    ]);

    const selection = parseInt(answers.selection);
    if (selection === 0) {
      return null;
    }

    return planeUsers[selection - 1];
  }

  public async syncAssignees(config: SyncConfig): Promise<{
    mappings: AssigneeMapping[];
    unmappedGitHub: string[];
    unmappedPlane: string[];
    github_users: Array<{
      login: string;
      email?: string;
      name?: string;
    }>;
    plane_users: Array<{
      id: string;
      display_name: string;
      email?: string;
    }>;
  }> {
    const [githubUsers, planeUsers] = await Promise.all([
      this.getGitHubUsers(),
      this.getPlaneUsers()
    ]);

    if (githubUsers.length === 0) {
      console.error('\nError: No GitHub users found!');
      console.error('Please ensure your GitHub token has the "read:org" permission to access organization members.');
      console.error('You can update your token permissions at: https://github.com/settings/tokens');
      process.exit(1);
    }

    const existingMappings = config.assignees?.mappings || [];
    const newMappings: AssigneeMapping[] = [];
    const unmappedGitHub: string[] = [];
    const unmappedPlane = [...planeUsers];

    for (const githubUser of githubUsers) {
      let match = this.findBestMatch(githubUser, planeUsers, existingMappings);

      if (!match) {
        match = await this.promptForManualMapping(githubUser, unmappedPlane);
      }

      if (match) {
        newMappings.push({
          githubUsername: githubUser.login,
          planeUserId: match.id,
          name: match.display_name
        });

        // Remove matched user from unmappedPlane
        const index = unmappedPlane.findIndex(u => u.id === match.id);
        if (index !== -1) unmappedPlane.splice(index, 1);
      } else {
        unmappedGitHub.push(githubUser.login);
      }
    }

    // Update config with the latest users and mappings
    config.assignees = {
      mappings: newMappings,
      lastSyncedAt: new Date().toISOString(),
      github_users: githubUsers.map(user => ({
        login: user.login,
        email: user.email,
        name: user.name
      })),
      plane_users: planeUsers.map(user => ({
        id: user.id,
        display_name: user.display_name,
        email: user.email
      }))
    };

    return {
      mappings: newMappings,
      unmappedGitHub,
      unmappedPlane: unmappedPlane.map(u => u.display_name),
      github_users: githubUsers.map(user => ({
        login: user.login,
        email: user.email,
        name: user.name
      })),
      plane_users: planeUsers.map(user => ({
        id: user.id,
        display_name: user.display_name,
        email: user.email
      }))
    };
  }
}
