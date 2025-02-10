import { Octokit } from '@octokit/rest';
import { ConfigManager } from '../config.js';
import { AssigneeMapping, SyncConfig } from '../types/index.js';
import { BrowserService } from './browser.js';

interface GitHubMember {
  login: string;
  id: number;
  node_id: string;
  avatar_url: string;
  url: string;
}

interface PlaneMember {
  id: string;
  username: string;
  first_name: string;
  last_name: string;
  email: string;
}

interface SyncResult {
  mappings: AssigneeMapping[];
  unmappedGitHub: string[];
  unmappedPlane: string[];
}

export class AssigneeService {
  private octokit: Octokit;
  private config: SyncConfig;
  private browser: BrowserService;

  constructor(configManager: ConfigManager) {
    this.config = configManager.getConfig();
    if (!process.env.GITHUB_TOKEN) {
      throw new Error('GITHUB_TOKEN environment variable is required');
    }
    this.octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
    this.browser = new BrowserService(
      process.env.PLANE_EMAIL || '',
      process.env.PLANE_PASSWORD || '',
      this.config.plane.baseUrl,
      this.config.plane.workspaceSlug,
      this.config.plane.projectSlug
    );
  }

  async getGitHubMembers(): Promise<GitHubMember[]> {
    const { data: members } = await this.octokit.rest.orgs.listMembers({
      org: this.config.github.owner,
    });
    return members;
  }

  async getPlaneMembers(): Promise<PlaneMember[]> {
    const members = await this.browser.getWorkspaceMembers();
    return members.map((member) => ({
      id: member.member_id,
      username: member.member__display_name,
      first_name: member.member__display_name.split(' ')[0],
      last_name: member.member__display_name.split(' ').slice(1).join(' '),
      email: '',
    }));
  }

  async syncAssignees(): Promise<SyncResult> {
    const githubMembers = await this.getGitHubMembers();
    const planeMembers = await this.getPlaneMembers();

    console.log('\nGitHub Organization Members:');
    console.log('---------------------------');
    githubMembers.forEach((member) => {
      console.log(`- ${member.login}`);
    });

    console.log('\nPlane Workspace Members:');
    console.log('----------------------');
    planeMembers.forEach((member) => {
      console.log(`- ${member.username} (${member.first_name} ${member.last_name})`);
    });

    const mappings = await this.promptForMappings(githubMembers, planeMembers);
    const unmappedGitHub = githubMembers
      .filter((github) => !mappings.some((m) => m.githubUsername === github.login))
      .map((m) => m.login);
    const unmappedPlane = planeMembers
      .filter((plane) => !mappings.some((m) => m.planeUserId === plane.id))
      .map((m) => m.id);

    return {
      mappings,
      unmappedGitHub,
      unmappedPlane,
    };
  }

  private async promptForMappings(
    githubMembers: GitHubMember[],
    planeMembers: PlaneMember[]
  ): Promise<AssigneeMapping[]> {
    const mappings: AssigneeMapping[] = [];
    for (const githubMember of githubMembers) {
      const planeMember = await this.promptForPlaneMember(githubMember, planeMembers);
      if (planeMember) {
        mappings.push({
          githubUsername: githubMember.login,
          planeUserId: planeMember.id,
        });
      }
    }
    return mappings;
  }

  private async promptForPlaneMember(
    githubMember: GitHubMember,
    planeMembers: PlaneMember[]
  ): Promise<PlaneMember | null> {
    // Implementation of user prompt
    return null;
  }
}
