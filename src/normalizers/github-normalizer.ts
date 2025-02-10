import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized';
import { IssueNormalizer } from './issue-normalizer';

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: Array<{
    name: string;
    color?: string;
    description?: string;
  }>;
  assignees: Array<{
    login: string;
  }>;
  created_at: string;
  updated_at: string;
  node_id: string;
  metadata?: any;
}

export interface CreateGitHubIssue {
  title: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
  assignees?: string[];
  metadata?: any;
}

export class GitHubNormalizer implements IssueNormalizer<GitHubIssue, CreateGitHubIssue> {
  async normalize(issue: GitHubIssue): Promise<NormalizedIssue> {
    return {
      id: issue.number.toString(),
      title: issue.title,
      description: issue.body || '',
      state: {
        category: issue.state === 'closed' ? NormalizedStateCategory.Done : NormalizedStateCategory.Todo,
        name: issue.state === 'closed' ? 'Closed' : 'Open'
      },
      labels: issue.labels.map(label => ({
        name: label.name,
        color: label.color ? `#${label.color}` : undefined,
        description: label.description
      })),
      assignees: issue.assignees.map(assignee => assignee.login),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      sourceProvider: 'github',
      metadata: {
        externalId: issue.number.toString(),
        nodeId: issue.node_id,
        ...(issue.metadata || {})
      }
    };
  }

  async denormalize(issue: NormalizedIssue): Promise<CreateGitHubIssue> {
    const result: CreateGitHubIssue = {
      title: issue.title,
      body: issue.description,
      state: issue.state.category === NormalizedStateCategory.Done ? 'closed' : 'open',
      labels: issue.labels.map(label => label.name),
      assignees: issue.assignees
    };

    if (issue.metadata && Object.keys(issue.metadata).length > 0) {
      result.metadata = issue.metadata;
    }

    return result;
  }

  private normalizeState(state: 'open' | 'closed'): NormalizedStateCategory {
    return state === 'closed' ? NormalizedStateCategory.Done : NormalizedStateCategory.Todo;
  }

  private denormalizeState(state: NormalizedStateCategory): 'open' | 'closed' {
    return state === NormalizedStateCategory.Done ? 'closed' : 'open';
  }

  private normalizeLabels(labels: Array<{ name: string; color?: string; description?: string }>): Array<{ name: string; color?: string; description?: string }> {
    return labels.map(label => ({
      name: label.name,
      color: label.color ? `#${label.color}` : undefined,
      description: label.description
    }));
  }

  private denormalizeLabels(labels: Array<{ name: string; color?: string; description?: string }>): Array<{ name: string; color?: string; description?: string }> {
    return labels.map(label => ({
      name: label.name,
      color: label.color ? label.color.replace('#', '') : undefined,
      description: label.description
    }));
  }

  private normalizeAssignees(assignees: Array<{ login: string }>): Array<string> {
    return assignees.map(assignee => assignee.login);
  }

  private denormalizeAssignees(assignees: Array<string>): Array<{ login: string }> {
    return assignees.map(login => ({ login }));
  }
}
