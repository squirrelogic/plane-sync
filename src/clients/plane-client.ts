import {
  IssueTrackingClient,
  BaseIssue,
  BaseLabel,
  BaseState,
  CreateIssueData,
  UpdateIssueData,
  CreateLabelData,
} from './base-client.js';

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

export interface PlaneIssueProperty {
  id: string;
  name: string;
  display_name: string;
  description?: string;
  property_type: string;
  default_value: any;
  values?: PlaneIssuePropertyValue[];
}

export interface PlaneIssuePropertyValue {
  id: string;
  name: string;
  description?: string;
  sort_order: number;
  is_active: boolean;
  is_default: boolean;
  external_id?: string;
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

  private validateProjectRef(projectRef: string): { workspaceSlug: string; projectSlug: string } {
    const [workspaceSlug, projectSlug] = projectRef.split('/');
    if (
      !workspaceSlug ||
      !projectSlug ||
      workspaceSlug.trim() === '' ||
      projectSlug.trim() === ''
    ) {
      throw new Error(`Invalid workspace ID: ${projectRef}`);
    }
    return { workspaceSlug, projectSlug };
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
        description: issue.state.description,
      },
      labels: issue.labels.map((label) => ({
        id: label.id,
        name: label.name,
        color: label.color,
        description: label.description,
      })),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      metadata: issue.metadata,
    };
  }

  private async mapBaseToPlaneIssue(
    data: CreateIssueData | UpdateIssueData,
    existingIssue?: PlaneIssue
  ): Promise<Partial<CreatePlaneIssueData>> {
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
    return (labels as BaseLabel[]).map((label) => label.id);
  }

  public async listIssues(projectRef: string): Promise<BaseIssue[]> {
    const { workspaceSlug, projectSlug } = this.validateProjectRef(projectRef);
    const issues = await this.getIssuesFromApi(workspaceSlug, projectSlug);
    return issues.map((issue) => this.mapPlaneIssueToBase(issue));
  }

  async getIssue(projectRef: string, issueId: string): Promise<BaseIssue> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const issue = await this.getIssueFromApi(workspaceId, projectId, issueId);
    return this.mapPlaneIssueToBase(issue);
  }

  async createIssue(projectRef: string, data: CreateIssueData): Promise<BaseIssue> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const planeData = await this.mapBaseToPlaneIssue(data);
    const issue = await this.createIssueInApi(workspaceId, projectId, {
      title: data.title,
      name: data.title,
      description: data.description,
      state: data.state,
      state_id: typeof data.state === 'string' ? data.state : data.state.id,
      label_ids: Array.isArray(data.labels)
        ? data.labels.map((label: string | BaseLabel) =>
            typeof label === 'string' ? label : label.id
          )
        : undefined,
      assignee_ids: [],
      metadata: data.metadata,
    });
    return this.mapPlaneIssueToBase(issue);
  }

  async updateIssue(
    projectRef: string,
    issueId: string,
    data: UpdateIssueData
  ): Promise<BaseIssue> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const planeData = await this.mapBaseToPlaneIssue(data);
    const issue = await this.updateIssueInApi(workspaceId, projectId, issueId, {
      title: data.title,
      name: data.title,
      description: data.description,
      state: data.state,
      state_id: typeof data.state === 'string' ? data.state : data.state?.id,
      label_ids: Array.isArray(data.labels)
        ? data.labels.map((label: string | BaseLabel) =>
            typeof label === 'string' ? label : label.id
          )
        : undefined,
      assignee_ids: [],
      metadata: data.metadata,
    });
    return this.mapPlaneIssueToBase(issue);
  }

  async deleteIssue(projectRef: string, issueId: string): Promise<void> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    await this.deleteIssueFromApi(workspaceId, projectId, issueId);
  }

  async getLabels(projectRef: string): Promise<BaseLabel[]> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const labels = await this.getLabelsFromApi(workspaceId, projectId);
    return labels.map((label) => ({
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description,
    }));
  }

  async getStates(projectRef: string): Promise<BaseState[]> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const states = await this.getStatesFromApi(workspaceId, projectId);
    return states.map((state) => ({
      id: state.id,
      name: state.name,
      color: state.color,
      description: state.description,
    }));
  }

  // API implementation methods
  protected async getIssuesFromApi(workspaceId: string, projectId: string): Promise<PlaneIssue[]> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/issues/`;
    return this.fetchApi(endpoint);
  }

  protected async getIssueFromApi(
    workspaceId: string,
    projectId: string,
    issueId: string
  ): Promise<PlaneIssue> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/issues/${issueId}/`;
    return this.fetchApi(endpoint);
  }

  protected async createIssueInApi(
    workspaceId: string,
    projectId: string,
    data: CreatePlaneIssueData
  ): Promise<PlaneIssue> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/issues/`;
    return this.fetchApi(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        name: data.name || data.title,
        description: data.description,
        state_id: data.state_id,
        label_ids: data.label_ids,
        assignee_ids: data.assignee_ids,
        metadata: data.metadata,
      }),
    });
  }

  protected async updateIssueInApi(
    workspaceId: string,
    projectId: string,
    issueId: string,
    data: UpdatePlaneIssueData
  ): Promise<PlaneIssue> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/issues/${issueId}/`;
    return this.fetchApi(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({
        name: data.name || data.title,
        description: data.description,
        state_id: data.state_id,
        label_ids: data.label_ids,
        assignee_ids: data.assignee_ids,
        metadata: data.metadata,
      }),
    });
  }

  protected async deleteIssueFromApi(
    workspaceId: string,
    projectId: string,
    issueId: string
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/issues/${issueId}/`;
    await this.fetchApi(endpoint, {
      method: 'DELETE',
    });
  }

  protected async getLabelsFromApi(workspaceId: string, projectId: string): Promise<PlaneLabel[]> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/`;
    return this.fetchApi(endpoint);
  }

  protected async getStatesFromApi(workspaceId: string, projectId: string): Promise<PlaneState[]> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/states/`;
    return this.fetchApi(endpoint);
  }

  async createLabel(projectRef: string, data: CreateLabelData): Promise<BaseLabel> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const label = await this.createLabelInApi(workspaceId, projectId, data);
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description,
    };
  }

  async updateLabel(
    projectRef: string,
    labelId: string,
    data: Partial<CreateLabelData>
  ): Promise<BaseLabel> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    const label = await this.updateLabelInApi(workspaceId, projectId, labelId, data);
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      description: label.description,
    };
  }

  protected async createLabelInApi(
    workspaceId: string,
    projectId: string,
    data: CreateLabelData
  ): Promise<PlaneLabel> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/`;
    return this.fetchApi(endpoint, {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        color: data.color || '#000000',
        description: data.description,
      }),
    });
  }

  protected async updateLabelInApi(
    workspaceId: string,
    projectId: string,
    labelId: string,
    data: Partial<CreateLabelData>
  ): Promise<PlaneLabel> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/${labelId}/`;
    return this.fetchApi(endpoint, {
      method: 'PATCH',
      body: JSON.stringify({
        name: data.name,
        color: data.color,
        description: data.description,
      }),
    });
  }

  protected async deleteLabelInApi(
    workspaceId: string,
    projectId: string,
    labelId: string
  ): Promise<void> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/labels/${labelId}/`;
    await this.fetchApi(endpoint, {
      method: 'DELETE',
    });
  }

  async getProperties(projectRef: string): Promise<PlaneIssueProperty[]> {
    const { workspaceId, projectId } = this.parseProjectRef(projectRef);
    return this.getPropertiesFromApi(workspaceId, projectId);
  }

  protected async getPropertiesFromApi(
    workspaceId: string,
    projectId: string
  ): Promise<PlaneIssueProperty[]> {
    const endpoint = `/api/v1/workspaces/${workspaceId}/projects/${projectId}/properties/`;
    return this.fetchApi(endpoint);
  }

  private async fetchApi(endpoint: string, options: RequestInit = {}): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response?.ok) {
      throw new Error(`Plane API error: ${response?.status} ${response?.statusText}`);
    }

    return response.json();
  }
}
