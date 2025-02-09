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

  private async mapGitHubStateToPlane(state: string, existingPlaneState?: string): Promise<string> {
    await this.initializeStates();

    // Log current states and mapping request
    console.log('Mapping GitHub state:', state);
    console.log('Existing Plane state:', existingPlaneState);
    console.log('Available Plane states:', this.states.map(s => `${s.id} (${s.group})`));

    // If the issue is already canceled in Plane, preserve that state
    if (existingPlaneState) {
      const existingState = this.states.find(s => s.id === existingPlaneState);
      if (existingState?.group === 'cancelled') {
        console.log('Preserving cancelled state in Plane');
        return existingPlaneState;
      }
    }

    // GitHub states: open, closed
    switch (state.toLowerCase()) {
      case 'open':
        const backlogState = this.states.find(s => s.group === 'backlog')?.id;
        console.log('Mapping open to backlog state:', backlogState);
        return backlogState || this.states[0].id;
      case 'closed':
        const completedState = this.states.find(s => s.group === 'completed')?.id;
        console.log('Mapping closed to completed state:', completedState);
        return completedState || this.states[0].id;
      default:
        console.log('Using default state:', this.states[0].id);
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
    console.log('Plane API Response:', JSON.stringify(response.data, null, 2));

    // The Plane API might return the issues in a nested structure
    const issues = response.data.results || response.data;

    if (!Array.isArray(issues)) {
      console.error('Unexpected API response structure:', issues);
      throw new Error('Unexpected API response structure: issues is not an array');
    }

    return issues.map((issue: any) => ({
      id: issue.id,
      title: issue.title || issue.name, // Some APIs use name instead of title
      description: issue.description || '',
      state: this.mapPlaneStateToGitHub(issue.state),
      labels: issue.labels || [],
      assignees: [], // Don't include assignees since we can't map Plane IDs to GitHub usernames
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
        description: issue.description || '',
        state: stateId,
        labels: issue.labels || []
        // Removed assignees since we don't sync them
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
      assignees: [], // Don't include assignees in the response
      createdAt: createdIssue.created_at,
      updatedAt: createdIssue.updated_at,
      hash: this.generateHash(createdIssue)
    };
  }

  public async updateIssue(issueId: string, issue: Issue): Promise<void> {
    // Get the current issue to check its state
    const response = await this.client.get(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/${issueId}/`
    );
    const currentIssue = response.data;

    const stateId = await this.mapGitHubStateToPlane(issue.state, currentIssue.state);
    const updateResponse = await this.client.patch(
      `/workspaces/${this.workspaceSlug}/projects/${this.projectSlug}/issues/${issueId}/`,
      {
        name: issue.title,
        description: issue.description || '',
        state: stateId,
        labels: issue.labels || []
        // Removed assignees since we don't sync them
      }
    );

    if (updateResponse.status !== 200) {
      throw new Error(`Failed to update issue: ${updateResponse.statusText}`);
    }
  }

  private generateHash(issue: any): string {
    return objectHash({
      title: issue.title || issue.name, // Match the same title field we use in getIssues
      description: issue.description || '',
      state: issue.state,
      labels: issue.labels || []
      // Removed assignees from hash calculation since we don't sync them
    });
  }
}
