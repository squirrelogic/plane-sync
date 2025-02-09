import { IssueTrackingClient, BaseIssue, BaseLabel, BaseState, CreateIssueData, UpdateIssueData, CreateLabelData } from './base-client';

export interface PlaneState {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

export interface PlaneLabel {
  id: string;
  name: string;
  color?: string;
  description?: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
  created_by?: string;
  updated_by?: string;
  project?: string;
  workspace?: string;
  parent?: string | null;
}

export interface PlaneIssue {
  id: string;
  name: string;
  description?: string;
  state: PlaneState;
  labels: PlaneLabel[];
  assignee_ids: string[];
  created_at: string;
  updated_at: string;
  metadata?: {
    externalId?: string;
    provider?: string;
    [key: string]: any;
  };
}

export interface CreatePlaneIssueData {
  title: string;
  description?: string;
  state: string | BaseState;
  labels?: string[] | BaseLabel[];
  metadata?: {
    externalId?: string;
    provider?: string;
    [key: string]: any;
  };
  // Plane-specific fields
  name?: string;
  state_id?: string;
  label_ids?: string[];
  assignee_ids?: string[];
}

export interface UpdatePlaneIssueData {
  title?: string;
  description?: string;
  state?: string | BaseState;
  labels?: string[] | BaseLabel[];
  metadata?: {
    externalId?: string;
    provider?: string;
    [key: string]: any;
  };
  // Plane-specific fields
  name?: string;
  state_id?: string;
  label_ids?: string[];
  assignee_ids?: string[];
}

export class PlaneClient implements IssueTrackingClient {
  constructor(
    private baseUrl: string,
    private apiKey: string
  ) {}

  private parseProjectRef(projectRef: string): { workspaceId: string; projectId: string } {
    const [workspaceId, projectId] = projectRef.split('/');
    if (!workspaceId || !projectId) {
      throw new Error('Invalid project reference. Expected format: workspaceId/projectId');
    }
    return { workspaceId, projectId };
  }

  private mapPlaneIssueToBase(issue: PlaneIssue): BaseIssue {
    return {
      id: issue.id,
      title: issue.name,
      description: issue.description,
      state: {
        id: issue.state.id,
        name: issue.state.name,
        color: issue.state.color,
        description: issue.state.description
      },
      labels: issue.labels.map(label => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description
      })),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      metadata: issue.metadata
    };
  }

  private async mapBaseToPlaneIssue(data: CreateIssueData | UpdateIssueData, existingIssue?: PlaneIssue): Promise<Partial<CreatePlaneIssueData>> {
    const result: Partial<CreatePlaneIssueData> = {};

    if ('title' in data) {
      result.title = data.title;
    }
    if ('description' in data) {
      result.description = data.description;
    }
    if (data.state) {
      result.state = typeof data.state === 'string' ? data.state : data.state.id;
    }
    if (data.labels) {
      result.labels = await this.resolveLabels(data.labels);
    }
    if ('metadata' in data) {
      result.metadata = data.metadata;
    }

    return result;
  }

  private async resolveLabels(labels: string[] | BaseLabel[]): Promise<string[]> {
    if (labels.length === 0) return [];
    if (typeof labels[0] === 'string') {
      return labels as string[];
    }
    return (labels as BaseLabel[]).map(label => label.id);
  }

  async listIssues(projectRef: string): Promise<BaseIssue[]> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const issues = await this.getIssuesFromApi(workspaceId, projectId);
    return issues.map(issue => this.mapPlaneIssueToBase(issue));
  }

  async getIssue(projectRef: string, issueId: string): Promise<BaseIssue> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const issue = await this.getIssueFromApi(workspaceId, projectId, issueId);
    return this.mapPlaneIssueToBase(issue);
  }

  async createIssue(projectRef: string, data: CreateIssueData): Promise<BaseIssue> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const planeData = await this.mapBaseToPlaneIssue(data);
    const issue = await this.createIssueInApi(workspaceId, projectId, planeData as CreatePlaneIssueData);
    return this.mapPlaneIssueToBase(issue);
  }

  async updateIssue(projectRef: string, issueId: string, data: UpdateIssueData): Promise<BaseIssue> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const existingIssue = await this.getIssueFromApi(workspaceId, projectId, issueId);
    const planeData = await this.mapBaseToPlaneIssue(data, existingIssue);
    const issue = await this.updateIssueInApi(workspaceId, projectId, issueId, planeData as UpdatePlaneIssueData);
    return this.mapPlaneIssueToBase(issue);
  }

  async deleteIssue(projectRef: string, issueId: string): Promise<void> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    await this.deleteIssueFromApi(workspaceId, projectId, issueId);
  }

  async getLabels(projectRef: string): Promise<BaseLabel[]> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const labels = await this.getLabelsFromApi(workspaceId, projectId);
    return labels.map(label => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description
    }));
  }

  async getStates(projectRef: string): Promise<BaseState[]> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const states = await this.getStatesFromApi(workspaceId, projectId);
    return states.map(state => ({
      id: state.id,
      name: state.name,
      color: state.color,
      description: state.description
    }));
  }

  // API implementation methods
  protected async getIssuesFromApi(workspaceId: string, projectId: string): Promise<PlaneIssue[]> {
    throw new Error('Not implemented');
  }

  protected async getIssueFromApi(workspaceId: string, projectId: string, issueId: string): Promise<PlaneIssue> {
    throw new Error('Not implemented');
  }

  protected async createIssueInApi(workspaceId: string, projectId: string, data: CreatePlaneIssueData): Promise<PlaneIssue> {
    throw new Error('Not implemented');
  }

  protected async updateIssueInApi(workspaceId: string, projectId: string, issueId: string, data: UpdatePlaneIssueData): Promise<PlaneIssue> {
    throw new Error('Not implemented');
  }

  protected async deleteIssueFromApi(workspaceId: string, projectId: string, issueId: string): Promise<void> {
    throw new Error('Not implemented');
  }

  protected async getLabelsFromApi(workspaceId: string, projectId: string): Promise<PlaneLabel[]> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/`;
    const response = await this.fetchApi(endpoint);
    return response;
  }

  protected async getStatesFromApi(workspaceId: string, projectId: string): Promise<PlaneState[]> {
    throw new Error('Not implemented');
  }

  async createLabel(projectRef: string, data: CreateLabelData): Promise<BaseLabel> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const label = await this.createLabelInApi(workspaceId, projectId, data);
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description
    };
  }

  protected async createLabelInApi(workspaceId: string, projectId: string, data: CreateLabelData): Promise<PlaneLabel> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/`;
    const response = await this.fetchApi(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        color: data.color || '#000000',
        description: data.description
      })
    });
    return response;
  }

  protected async updateLabelInApi(workspaceId: string, projectId: string, labelId: string, data: Partial<CreateLabelData>): Promise<PlaneLabel> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/${labelId}/`;
    const response = await this.fetchApi(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({
        name: data.name,
        color: data.color,
        description: data.description
      })
    });
    return response;
  }

  protected async deleteLabelInApi(workspaceId: string, projectId: string, labelId: string): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/${labelId}/`;
    await this.fetchApi(endpoint, {
      method: 'DELETE'
    });
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      throw new Error(`Plane API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }
}
