import { NormalizedIssue } from './normalized.js';

export interface Issue {
  id: string;
  externalId?: string; // ID from external system (e.g., GitHub issue number)
  title: string;
  description: string;
  state: IssueState;
  labels: Label[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>; // Store provider-specific data
}

export interface IssueState {
  id: string;
  name: string;
  category: 'backlog' | 'todo' | 'in_progress' | 'ready' | 'done';
  color?: string;
}

export interface Label {
  id: string;
  name: string;
  color?: string;
  description?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  body: string;
  status: 'BACKLOG' | 'TODO' | 'IN_PROGRESS' | 'READY' | 'DONE';
  convertedToIssue: boolean;
  issueNumber?: number;
}

export interface AssigneeMapping {
  githubUsername: string;
  planeUserId: string;
}

export interface SyncOptions {
  configPath?: string;
  direction?: 'github-to-plane' | 'plane-to-github' | 'both';
}

export interface SyncConfig {
  github: {
    owner: string;
    repo: string;
    projectNumber: number;
    isOrgProject: boolean;
  };
  plane: {
    baseUrl: string;
    workspaceSlug: string;
    projectSlug: string;
  };
  sync: {
    direction: 'github-to-plane' | 'plane-to-github' | 'both';
    autoConvertBacklogItems: boolean;
  };
  assignees?: {
    mappings: AssigneeMapping[];
  };
}

export interface SyncState {
  lastSync: string | null;
  issues: {
    [key: string]: {
      sourceId: string;
      targetId: string;
      lastHash: string;
      isProjectItem?: boolean;
    };
  };
}

export interface IssueChange {
  source: string;
  issue: NormalizedIssue;
  lastSyncHash?: string;
}

export interface IssueConflict {
  sourceIssue: NormalizedIssue;
  targetIssue: NormalizedIssue;
  lastSyncHash: string;
  conflictingFields: {
    field: string;
    sourceValue: any;
    targetValue: any;
  }[];
}

export interface SyncResult {
  sourceToTargetChanges: IssueChange[];
  targetToSourceChanges: IssueChange[];
  conflicts: IssueConflict[];
  errors: Error[];
}
