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
  assignees?: string[];
}

export class GitHubNormalizer implements IssueNormalizer<GitHubIssue, CreateGitHubIssue> {
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
        externalId: issue.number.toString(),
        nodeId: issue.node_id,
      },
      sourceProvider: 'github',
    };
  }

  async denormalize(issue: NormalizedIssue): Promise<CreateGitHubIssue> {
    return {
      title: issue.title,
      body: issue.description,
      state: issue.state.category === NormalizedStateCategory.Done ? 'closed' : 'open',
      labels: issue.labels.map((label) => label.name),
      assignees: issue.assignees,
    };
  }

  private getCategoryFromState(state: string): NormalizedStateCategory {
    switch (state.toLowerCase()) {
      case 'open':
        return NormalizedStateCategory.Todo;
      case 'closed':
        return NormalizedStateCategory.Done;
      default:
        return NormalizedStateCategory.Todo;
    }
  }
}
