import { Octokit } from '@octokit/rest';
import { GitHubIssue } from '../normalizers/github-normalizer.js';
import {
  IssueTrackingClient,
  BaseIssue,
  BaseLabel,
  BaseState,
  CreateIssueData,
  UpdateIssueData,
  CreateLabelData,
} from './base-client.js';

interface GitHubLabel {
  name: string;
  color?: string;
  description?: string;
}

export class GitHubClient implements IssueTrackingClient {
  private octokit: Octokit;

  constructor(token: string) {
    if (!token || typeof token !== 'string' || token.trim() === '') {
      throw new Error('Invalid GitHub token');
    }
    this.octokit = new Octokit({ auth: token });
  }

  private validateProjectRef(projectRef: string): { owner: string; repo: string } {
    const [owner, repo] = projectRef.split('/');
    if (!owner || !repo || owner.trim() === '' || repo.trim() === '') {
      throw new Error('Invalid project reference');
    }
    return { owner, repo };
  }

  private mapGitHubIssueToBase(issue: GitHubIssue): BaseIssue {
    return {
      id: issue.number.toString(),
      title: issue.title,
      description: issue.body || undefined,
      state: {
        id: issue.state,
        name: issue.state.charAt(0).toUpperCase() + issue.state.slice(1),
      },
      labels: issue.labels.map((label: GitHubLabel) => ({
        id: label.name,
        name: label.name,
        color: label.color ? `#${label.color}` : undefined,
        description: label.description || undefined,
      })),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      metadata: {
        provider: 'github',
        externalId: issue.number.toString(),
      },
    };
  }

  private mapGitHubLabelToBase(label: any): BaseLabel {
    return {
      id: label.id.toString(),
      name: label.name,
      color: label.color ? `#${label.color}` : undefined,
      description: label.description || undefined,
    };
  }

  public async listIssues(projectRef: string): Promise<BaseIssue[]> {
    const { owner, repo } = this.validateProjectRef(projectRef);
    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'all',
      per_page: 100,
    });

    return issues
      .filter((issue) => !('pull_request' in issue))
      .map((issue) => this.mapGitHubIssueToBase(issue as GitHubIssue));
  }

  public async getIssue(projectRef: string, issueId: string): Promise<BaseIssue> {
    const { owner, repo } = this.validateProjectRef(projectRef);
    const { data: issue } = await this.octokit.rest.issues.get({
      owner,
      repo,
      issue_number: parseInt(issueId),
    });

    return this.mapGitHubIssueToBase(issue as GitHubIssue);
  }

  public async createIssue(projectRef: string, data: CreateIssueData): Promise<BaseIssue> {
    const { owner, repo } = this.validateProjectRef(projectRef);
    const { data: issue } = await this.octokit.rest.issues.create({
      owner,
      repo,
      title: data.title,
      body: data.description,
      labels: data.labels?.map((label) => (typeof label === 'string' ? label : label.name)),
      state: (typeof data.state === 'string' ? data.state : data.state?.id) as 'open' | 'closed',
    });

    return this.mapGitHubIssueToBase(issue as GitHubIssue);
  }

  public async updateIssue(
    projectRef: string,
    issueId: string,
    data: UpdateIssueData
  ): Promise<BaseIssue> {
    const { owner, repo } = this.validateProjectRef(projectRef);
    const { data: issue } = await this.octokit.rest.issues.update({
      owner,
      repo,
      issue_number: parseInt(issueId),
      title: data.title,
      body: data.description,
      state: (typeof data.state === 'string' ? data.state : data.state?.id) as 'open' | 'closed',
      labels: data.labels?.map((label) => (typeof label === 'string' ? label : label.name)),
    });

    return this.mapGitHubIssueToBase(issue as GitHubIssue);
  }

  public async deleteIssue(projectRef: string, issueId: string): Promise<void> {
    const { owner, repo } = this.validateProjectRef(projectRef);
    await this.octokit.rest.issues.update({
      owner,
      repo,
      issue_number: parseInt(issueId),
      state: 'closed',
    });
  }

  public async getLabels(projectRef: string): Promise<BaseLabel[]> {
    const { owner, repo } = this.validateProjectRef(projectRef);
    const { data: labels } = await this.octokit.rest.issues.listLabelsForRepo({
      owner,
      repo,
    });

    return labels.map((label) => this.mapGitHubLabelToBase(label));
  }

  public async getStates(projectRef: string): Promise<BaseState[]> {
    return [
      { id: 'open', name: 'Open' },
      { id: 'closed', name: 'Closed' },
    ];
  }

  public async createLabel(projectRef: string, data: CreateLabelData): Promise<BaseLabel> {
    const { owner, repo } = this.validateProjectRef(projectRef);
    const { data: label } = await this.octokit.rest.issues.createLabel({
      owner,
      repo,
      name: data.name,
      color: data.color?.replace('#', '') || '000000',
      description: data.description,
    });

    return this.mapGitHubLabelToBase(label);
  }
}
