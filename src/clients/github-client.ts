import { Octokit } from '@octokit/rest';
import { GitHubIssue } from '../normalizers/github-normalizer';
import { IssueTrackingClient, BaseIssue, BaseLabel, BaseState, CreateIssueData, UpdateIssueData, CreateLabelData } from './base-client';

interface GitHubLabel {
  id: number;
  name: string;
  color?: string;
  description?: string;
}

export class GitHubClient implements IssueTrackingClient {
  private octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  private parseProjectRef(projectRef: string): { owner: string; repo: string } {
    const [owner, repo] = projectRef.split('/');
    if (!owner || !repo) {
      throw new Error('Invalid project reference. Expected format: owner/repo');
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
      labels: issue.labels.map(label => ({
        id: label.name,
        name: label.name,
        color: label.color ? `#${label.color}` : undefined,
        description: label.description || undefined
      })),
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      metadata: {
        provider: 'github',
        externalId: issue.number.toString()
      }
    };
  }

  async listIssues(projectRef: string): Promise<BaseIssue[]> {
    const { owner, repo } = this.parseProjectRef(projectRef);
    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'all'
    });
    return issues
      .filter(issue => !issue.pull_request)
      .map(issue => this.mapGitHubIssueToBase(issue as GitHubIssue));
  }

  async getIssue(projectRef: string, issueId: string): Promise<BaseIssue> {
    const { owner, repo } = this.parseProjectRef(projectRef);
    const { data: issue } = await this.octokit.rest.issues.get({
      owner,
      repo,
      issue_number: parseInt(issueId)
    });
    return this.mapGitHubIssueToBase(issue as GitHubIssue);
  }

  async createIssue(projectRef: string, data: CreateIssueData): Promise<BaseIssue> {
    const { owner, repo } = this.parseProjectRef(projectRef);
    const { data: issue } = await this.octokit.rest.issues.create({
      owner,
      repo,
      title: data.title,
      body: data.description,
      labels: Array.isArray(data.labels)
        ? data.labels.map(label => typeof label === 'string' ? label : label.name)
        : undefined
    });
    return this.mapGitHubIssueToBase(issue as GitHubIssue);
  }

  async updateIssue(projectRef: string, issueId: string, data: UpdateIssueData): Promise<BaseIssue> {
    const { owner, repo } = this.parseProjectRef(projectRef);
    const updateData: any = {
      owner,
      repo,
      issue_number: parseInt(issueId)
    };

    if (data.title) updateData.title = data.title;
    if (data.description) updateData.body = data.description;
    if (data.state) {
      updateData.state = typeof data.state === 'string' ? data.state : data.state.id;
    }
    if (data.labels) {
      updateData.labels = Array.isArray(data.labels)
        ? data.labels.map(label => typeof label === 'string' ? label : label.name)
        : undefined;
    }

    const { data: issue } = await this.octokit.rest.issues.update(updateData);
    return this.mapGitHubIssueToBase(issue as GitHubIssue);
  }

  async deleteIssue(projectRef: string, issueId: string): Promise<void> {
    const { owner, repo } = this.parseProjectRef(projectRef);
    await this.octokit.rest.issues.update({
      owner,
      repo,
      issue_number: parseInt(issueId),
      state: 'closed'
    });
  }

  async getLabels(projectRef: string): Promise<BaseLabel[]> {
    const { owner, repo } = this.parseProjectRef(projectRef);
    const { data: labels } = await this.octokit.rest.issues.listLabelsForRepo({
      owner,
      repo
    });
    return labels.map(label => ({
      id: label.id.toString(),
      name: label.name,
      color: label.color ? `#${label.color}` : undefined,
      description: label.description || undefined
    }));
  }

  async getStates(projectRef: string): Promise<BaseState[]> {
    return [
      { id: 'open', name: 'Open' },
      { id: 'closed', name: 'Closed' }
    ];
  }

  async createLabel(projectRef: string, data: CreateLabelData): Promise<BaseLabel> {
    const { owner, repo } = this.parseProjectRef(projectRef);
    const { data: label } = await this.octokit.rest.issues.createLabel({
      owner,
      repo,
      name: data.name,
      color: data.color?.replace('#', '') || '000000',
      description: data.description
    });

    return {
      id: label.id.toString(),
      name: label.name,
      color: label.color ? `#${label.color}` : undefined,
      description: label.description || undefined
    };
  }
}
