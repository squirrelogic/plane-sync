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

export interface CreateIssueData {
  name: string;
  description?: string;
  state_id: string;
  label_ids?: string[];
  assignee_ids?: string[];
  metadata?: {
    externalId?: string;
    provider?: string;
    [key: string]: any;
  };
}

export interface UpdateIssueData {
  name?: string;
  description?: string;
  state_id?: string;
  label_ids?: string[];
  assignee_ids?: string[];
}

export interface CreateLabelData {
  name: string;
  color?: string;
  description?: string;
}

export interface PlaneClient {
  getIssues(workspaceId: string, projectId: string): Promise<PlaneIssue[]>;
  getIssue(workspaceId: string, projectId: string, issueId: string): Promise<PlaneIssue>;
  createIssue(workspaceId: string, projectId: string, data: CreateIssueData): Promise<PlaneIssue>;
  updateIssue(workspaceId: string, projectId: string, issueId: string, data: Partial<CreateIssueData>): Promise<PlaneIssue>;
  deleteIssue(workspaceId: string, projectId: string, issueId: string): Promise<void>;
  getLabels(workspaceId: string, projectId: string): Promise<PlaneLabel[]>;
  getStates(workspaceId: string, projectId: string): Promise<PlaneState[]>;
  createLabel(workspaceId: string, projectId: string, data: { name: string; color: string; description?: string }): Promise<PlaneLabel>;
}
