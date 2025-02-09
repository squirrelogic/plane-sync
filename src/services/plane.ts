import axios, { AxiosInstance } from 'axios';
import { Issue } from '../types';
import objectHash from 'object-hash';

interface PlaneState {
  id: string;
  name: string;
  group: string;
}

export class PlaneService {
  private client: AxiosInstance;
  private workspaceSlug: string;
  private projectSlug: string;
  private states: PlaneState[] = [];
  private assigneeMappings: Map<string, string>;

  constructor(
    apiKey: string,
    baseUrl: string,
    workspaceSlug: string,
    projectSlug: string,
    assigneeMappings?: { githubUsername: string; planeUserId: string }[]
  ) {
    this.client = axios.create({
      baseURL: baseUrl.endsWith('/') ? baseUrl + 'api/v1' : baseUrl + '/api/v1',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    this.workspaceSlug = workspaceSlug;
    this.projectSlug = projectSlug;
    this.assigneeMappings = new Map(
      assigneeMappings?.map(m => [m.githubUsername, m.planeUserId]) || []
    );
  }

  private async initializeStates(): Promise<void> {
    if (this.states.length === 0) {
      const response = await this.client.get(
        `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/states/`
      );
      this.states = response.data.results;
    }
  }

  private async mapGitHubStateToPlane(state: { id: string; name: string }, existingPlaneState?: string): Promise<string> {
    await this.initializeStates();

    // If there's an existing state in Plane, check if we should preserve it
    if (existingPlaneState) {
      const existingState = this.states.find(s => s.id === existingPlaneState);
      if (!existingState) return this.states[0].id;

      // Only update state if it's explicitly different
      const currentName = existingState.name.toLowerCase();
      const targetState = state.name.toLowerCase();
      // If the states roughly match, preserve the Plane state
      if ((targetState === 'backlog' && currentName === 'backlog') ||
          (targetState === 'todo' && currentName === 'todo') ||
          (targetState === 'in progress' && currentName === 'in progress') ||
          (targetState === 'done' && (currentName === 'done' || currentName === 'cancelled')) ||
          (targetState === 'closed' && (currentName === 'done' || currentName === 'cancelled'))) {
        return existingPlaneState;
      }
    }

    // Map GitHub project states to Plane states
    switch (state.name.toLowerCase()) {
      case 'backlog':
        const backlogState = this.states.find(s => s.name.toLowerCase() === 'backlog')?.id;
        return backlogState || this.states[0].id;

      case 'todo':
        const todoState = this.states.find(s => s.name.toLowerCase() === 'todo')?.id;
        return todoState || this.states[0].id;

      case 'in progress':
        const inProgressState = this.states.find(s => s.name.toLowerCase() === 'in progress')?.id;
        return inProgressState || this.states[0].id;

      case 'in review':
        // Map In Review to In Progress in Plane
        const reviewState = this.states.find(s => s.name.toLowerCase() === 'in progress')?.id;
        return reviewState || this.states[0].id;

      case 'done':
      case 'closed':
        const doneState = this.states.find(s => s.name.toLowerCase() === 'done')?.id;
        return doneState || this.states[0].id;

      default:
        return this.states[0].id;
    }
  }

  private mapPlaneStateToGitHub(stateId: string): { id: string; name: string } {
    const state = this.states.find(s => s.id === stateId);
    if (!state) return { id: '', name: 'BACKLOG' };

    // Map Plane states to GitHub project states
    const normalizedState = this.normalizeStateName(state.name);
    return { id: '', name: normalizedState };
  }

  async getIssues(): Promise<Issue[]> {
    await this.initializeStates();
    const response = await this.client.get(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/`
    );

    // The Plane API might return the issues in a nested structure
    const issues = response.data.results || response.data;

    if (!Array.isArray(issues)) {
      console.error('Unexpected API response structure:', issues);
      throw new Error('Unexpected API response structure: issues is not an array');
    }

    return issues.map((issue: any) => ({
      id: issue.id,
      title: issue.title || issue.name,
      description: issue.description || '',
      state: this.mapPlaneStateToGitHub(issue.state),
      labels: issue.labels || [],
      // Deduplicate assignees and map them to GitHub usernames
      assignees: Array.from(new Set(issue.assignees || [])).map(id => {
        const githubUsername = Array.from(this.assigneeMappings.entries())
          .find(([_, planeUserId]) => planeUserId === id)?.[0];
        return githubUsername || id;
      }).filter((username): username is string => username !== undefined),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      hash: this.generateHash(issue)
    }));
  }

  async getIssue(issueId: string): Promise<Issue> {
    await this.initializeStates();
    const response = await this.client.get(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/${issueId}/`
    );

    const issue = response.data;
    return {
      id: issue.id,
      title: issue.title || issue.name,
      description: issue.description || '',
      state: this.mapPlaneStateToGitHub(issue.state),
      labels: issue.labels || [],
      // Deduplicate assignees and map them to GitHub usernames
      assignees: Array.from(new Set(issue.assignees || [])).map(id => {
        const githubUsername = Array.from(this.assigneeMappings.entries())
          .find(([_, planeUserId]) => planeUserId === id)?.[0];
        return githubUsername || id;
      }).filter((username): username is string => username !== undefined),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      hash: this.generateHash(issue)
    };
  }

  async createIssue(issue: Omit<Issue, 'id' | 'hash'>): Promise<Issue> {
    const stateId = await this.mapGitHubStateToPlane({ id: '', name: issue.state.name }, undefined);

    // Deduplicate and map GitHub usernames to Plane user IDs
    const mappedAssignees = Array.from(new Set(issue.assignees || [])).map(username =>
      this.assigneeMappings.get(username)
    ).filter((id): id is string => id !== undefined);

    const response = await this.client.post(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/`,
      {
        name: issue.title,
        description: issue.description || '',
        state: stateId,
        labels: issue.labels || [],
        assignees: mappedAssignees
      }
    );

    if (response.status !== 201) {
      throw new Error(`Failed to create issue: ${response.statusText}`);
    }

    const createdIssue = response.data;
    return {
      id: createdIssue.id,
      title: createdIssue.title || createdIssue.name,
      description: createdIssue.description || '',
      state: this.mapPlaneStateToGitHub(createdIssue.state),
      labels: createdIssue.labels || [],
      // Deduplicate assignees and map them back to GitHub usernames
      assignees: Array.from(new Set(createdIssue.assignees || [])).map(id => {
        const githubUsername = Array.from(this.assigneeMappings.entries())
          .find(([_, planeUserId]) => planeUserId === id)?.[0];
        return githubUsername || id;
      }).filter((username): username is string => username !== undefined),
      createdAt: createdIssue.created_at,
      updatedAt: createdIssue.updated_at,
      hash: this.generateHash(createdIssue)
    };
  }

  public async updateIssue(issueId: string, issue: Issue): Promise<Issue> {
    // Get the current issue to check its state
    const response = await this.client.get(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/${issueId}/`
    );
    const currentIssue = response.data;

    const stateId = await this.mapGitHubStateToPlane(issue.state, currentIssue.state);

    // Deduplicate and map GitHub usernames to Plane user IDs
    const mappedAssignees = Array.from(new Set(issue.assignees || [])).map(username =>
      this.assigneeMappings.get(username)
    ).filter((id): id is string => id !== undefined);

    const updateResponse = await this.client.patch(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/${issueId}/`,
      {
        name: issue.title,
        description: issue.description || '',
        state: stateId,
        labels: issue.labels || [],
        assignees: mappedAssignees
      }
    );

    if (updateResponse.status !== 200) {
      throw new Error(`Failed to update issue: ${updateResponse.statusText}`);
    }

    // Get the updated issue to return with its new hash
    const updatedIssue = await this.getIssue(issueId);
    return updatedIssue;
  }

  private generateHash(issue: any): string {
    // If this is a raw Plane API response, map the state first
    const state = typeof issue.state === 'string'
      ? this.states.find(s => s.id === issue.state)?.name.toLowerCase() || 'backlog'
      : typeof issue.state === 'object' && issue.state.name
        ? issue.state.name.toLowerCase()
        : 'backlog';

    // Normalize the state name to match GitHub's format
    const normalizedState = this.normalizeStateName(state);

    return objectHash({
      title: issue.title || issue.name,
      description: issue.description || '',
      state: normalizedState,
      labels: issue.labels || [],
      assignees: issue.assignees || []
    });
  }

  private normalizeStateName(state: string): string {
    switch (state.toLowerCase()) {
      case 'backlog':
        return 'BACKLOG';
      case 'todo':
        return 'TODO';
      case 'in progress':
        return 'IN_PROGRESS';
      case 'ready':
        return 'READY';
      case 'done':
      case 'cancelled':
      case 'closed':
        return 'DONE';
      default:
        return 'BACKLOG';
    }
  }
}
