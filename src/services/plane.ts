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

  constructor(apiKey: string, baseUrl: string, workspaceSlug: string, projectSlug: string) {
    this.client = axios.create({
      baseURL: baseUrl.endsWith('/') ? baseUrl + 'api/v1' : baseUrl + '/api/v1',
      headers: {
        'X-API-Key': apiKey,
        'Content-Type': 'application/json'
      }
    });
    this.workspaceSlug = workspaceSlug;
    this.projectSlug = projectSlug;
  }

  private async initializeStates(): Promise<void> {
    if (this.states.length === 0) {
      const response = await this.client.get(
        `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/states/`
      );
      this.states = response.data.results;
    }
  }

  private async mapGitHubStateToPlane(state: string): Promise<string> {
    await this.initializeStates();
    // GitHub states: open, closed
    switch (state.toLowerCase()) {
      case 'open':
        return this.states.find(s => s.group === 'backlog')?.id || this.states[0].id;
      case 'closed':
        return this.states.find(s => s.group === 'completed')?.id || this.states[0].id;
      default:
        return this.states[0].id;
    }
  }

  private mapPlaneStateToGitHub(stateId: string): 'open' | 'closed' {
    const state = this.states.find(s => s.id === stateId);
    if (state?.group === 'completed' || state?.group === 'cancelled') {
      return 'closed';
    }
    return 'open';
  }

  async getIssues(): Promise<Issue[]> {
    await this.initializeStates();
    const response = await this.client.get(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/`
    );
    const issues = response.data;

    return issues.map((issue: any) => ({
      id: issue.id,
      title: issue.title,
      description: issue.description || '',
      state: this.mapPlaneStateToGitHub(issue.state),
      labels: issue.labels || [],
      assignees: issue.assignees || [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      hash: this.generateHash(issue)
    }));
  }

  async createIssue(issue: Omit<Issue, 'id' | 'hash'>): Promise<Issue> {
    const stateId = await this.mapGitHubStateToPlane(issue.state);
    const response = await this.client.post(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/`,
      {
        name: issue.title,
        description: issue.description,
        state: stateId,
        labels: issue.labels,
        assignees: issue.assignees
      }
    );

    if (response.status !== 201) {
      throw new Error(`Failed to create issue: ${response.statusText}`);
    }

    const createdIssue = response.data;
    return {
      ...createdIssue,
      state: this.mapPlaneStateToGitHub(createdIssue.state),
      hash: this.generateHash(createdIssue)
    };
  }

  public async updateIssue(issueId: string, issue: Issue): Promise<void> {
    const stateId = await this.mapGitHubStateToPlane(issue.state);
    const response = await this.client.patch(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/${issueId}/`,
      {
        name: issue.title,
        description: issue.description || '',
        state: stateId,
      }
    );

    if (response.status !== 200) {
      throw new Error(`Failed to update issue: ${response.statusText}`);
    }
  }

  private generateHash(issue: any): string {
    return objectHash({
      title: issue.title,
      description: issue.description,
      state: issue.state,
      labels: issue.labels,
      assignees: issue.assignees
    });
  }
}
