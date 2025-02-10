import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized.js';
import { IssueNormalizer } from './issue-normalizer.js';
import { BaseIssue, BaseLabel } from '../clients/base-client.js';

export interface GitHubLabel {
  name: string;
  color?: string;
  description?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body?: string;
  state: 'open' | 'closed';
  labels: GitHubLabel[];
  assignees: any[];
  created_at: string;
  updated_at: string;
  node_id: string;
}

export interface CreateGitHubIssue {
  title: string;
  body?: string;
  state?: 'open' | 'closed';
  labels?: string[];
}

export class GitHubNormalizer implements IssueNormalizer<GitHubIssue, BaseIssue> {
  async normalize(issue: GitHubIssue): Promise<NormalizedIssue> {
    return {
      id: issue.number.toString(),
      title: issue.title,
      description: issue.body || '',
      state: {
        category: this.getCategoryFromState(issue.state),
        name: issue.state.charAt(0).toUpperCase() + issue.state.slice(1),
      },
      labels: issue.labels.map((label: GitHubLabel) => ({
        name: label.name,
        color: label.color ? `#${label.color}` : undefined,
        description: label.description,
      })),
      assignees: issue.assignees.map((a) => a.login),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      metadata: {
        provider: 'github',
        externalId: issue.number.toString(),
        nodeId: issue.node_id,
      },
      sourceProvider: 'github',
    };
  }

  async denormalize(issue: NormalizedIssue): Promise<BaseIssue> {
    return {
      id: issue.id,
      title: issue.title,
      description: issue.description,
      state: {
        id: issue.state.name.toLowerCase(),
        name: issue.state.name,
      },
      labels: issue.labels.map(
        (label): BaseLabel => ({
          id: label.name,
          name: label.name,
          color: label.color?.replace('#', ''),
          description: label.description,
        })
      ),
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      metadata: {
        ...issue.metadata,
        provider: 'github',
      },
    };
  }

  private getCategoryFromState(state: string): NormalizedStateCategory {
    switch (state.toLowerCase()) {
      case 'open':
        return NormalizedStateCategory.Backlog;
      case 'closed':
        return NormalizedStateCategory.Done;
      default:
        return NormalizedStateCategory.Backlog;
    }
  }
}
