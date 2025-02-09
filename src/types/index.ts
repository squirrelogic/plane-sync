export interface Issue {
  id: string;
  title: string;
  description: string;
  state: string;
  labels: string[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  hash?: string;
}

export interface ProjectItem {
  id: string;
  title: string;
  body: string;
  status: 'BACKLOG' | 'READY' | 'IN_PROGRESS' | 'DONE';
  convertedToIssue: boolean;
  issueNumber?: number;
}

export interface SyncConfig {
  github: {
    owner: string;
    repo: string;
    projectNumber: number;
    isOrgProject: boolean;  // Whether this is an organization project
  };
  plane: {
    baseUrl: string;  // For self-hosted instances
    workspaceSlug: string;
    projectSlug: string;
  };
  sync: {
    direction: 'github-to-plane' | 'plane-to-github' | 'both';
    autoConvertBacklogItems: boolean;  // Whether to automatically convert backlog items to issues
  };
}

export interface SyncOptions {
  configPath?: string;  // Path to config file, if not using default
  githubRepo?: string;  // Optional now, can be in config
  planeProject?: string;  // Optional now, can be in config
  direction?: 'github-to-plane' | 'plane-to-github' | 'both';
}

export interface SyncState {
  lastSync: string;
  issues: {
    [key: string]: {
      githubId: string;
      planeId: string;
      lastHash: string;
      isProjectItem?: boolean;
    };
  };
}

export interface IssueChange {
  source: 'github' | 'plane';
  issue: Issue;
  lastSyncHash?: string;
}

export interface IssueConflict {
  githubIssue: Issue;
  planeIssue: Issue;
  lastSyncHash?: string;
  conflictingFields: {
    field: string;
    githubValue: any;
    planeValue: any;
  }[];
}

export interface SyncResult {
  githubToPlaneChanges: IssueChange[];
  planeToGithubChanges: IssueChange[];
  conflicts: IssueConflict[];
  errors: Error[];
}
