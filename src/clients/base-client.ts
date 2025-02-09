export interface BaseIssue {
  id: string;
  title: string;
  description?: string;
  state: BaseState;
  labels: BaseLabel[];
  createdAt: string;
  updatedAt: string;
  metadata?: {
    externalId?: string;
    provider?: string;
    [key: string]: any;
  };
}

export interface BaseState {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

export interface BaseLabel {
  id: string;
  name: string;
  color?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export interface CreateLabelData {
  name: string;
  color?: string;
  description?: string;
}

export interface CreateIssueData {
  title: string;
  description?: string;
  state: string | BaseState;
  labels?: string[] | BaseLabel[];
  metadata?: {
    externalId?: string;
    provider?: string;
    [key: string]: any;
  };
}

export interface UpdateIssueData {
  title?: string;
  description?: string;
  state?: string | BaseState;
  labels?: string[] | BaseLabel[];
}

export interface IssueTrackingClient {
  listIssues(projectRef: string): Promise<BaseIssue[]>;
  getIssue(projectRef: string, issueId: string): Promise<BaseIssue>;
  createIssue(projectRef: string, data: CreateIssueData): Promise<BaseIssue>;
  updateIssue(projectRef: string, issueId: string, data: UpdateIssueData): Promise<BaseIssue>;
  deleteIssue(projectRef: string, issueId: string): Promise<void>;
  getLabels(projectRef: string): Promise<BaseLabel[]>;
  getStates(projectRef: string): Promise<BaseState[]>;
  createLabel(projectRef: string, data: CreateLabelData): Promise<BaseLabel>;
}
