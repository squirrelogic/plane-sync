import { Octokit } from '@octokit/rest';
import { RepoProvider } from './repo-provider';
import { NormalizedIssue, NormalizedLabel, NormalizedState, StateMappingConfig, NormalizedStateCategory } from '../types/normalized';
import { IssueState } from '../types';
import { GitHubNormalizer, GitHubIssue, CreateGitHubIssue } from '../normalizers/github-normalizer';
import { BaseProvider } from './base-provider';

export class GitHubProvider extends BaseProvider implements RepoProvider {
  protected readonly name = 'github';
  protected readonly stateMappingConfig: StateMappingConfig = {
    stateMapping: {
      open: NormalizedStateCategory.Backlog,
      closed: NormalizedStateCategory.Done
    },
    defaultCategory: NormalizedStateCategory.Backlog
  };
  private octokit: Octokit;
  public readonly normalizer: GitHubNormalizer;

  constructor(
    token: string,
    private owner: string,
    private repo: string,
    private projectId?: number,
    private useProjectV2: boolean = false
  ) {
    super();
    this.octokit = new Octokit({ auth: token });
    this.normalizer = new GitHubNormalizer();
  }

  async getIssues(): Promise<NormalizedIssue[]> {
    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      state: 'all'
    });

    return Promise.all(
      issues
        .filter(issue => !issue.pull_request)
        .map(issue => this.normalizer.normalize(issue as GitHubIssue))
    );
  }

  async getIssue(id: string): Promise<NormalizedIssue> {
    const { data: issue } = await this.octokit.rest.issues.get({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(id)
    });

    if (issue.pull_request) {
      throw new Error('Issue is a pull request');
    }

    return this.normalizer.normalize(issue as GitHubIssue);
  }

  async createIssue(issue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'>): Promise<NormalizedIssue> {
    const githubIssue = await this.normalizer.denormalize(issue as NormalizedIssue);
    const { data } = await this.octokit.issues.create({
      owner: this.owner,
      repo: this.repo,
      ...githubIssue
    });

    return this.normalizer.normalize(data as GitHubIssue);
  }

  async updateIssue(id: string, issue: Partial<NormalizedIssue>): Promise<NormalizedIssue> {
    const githubIssue = await this.normalizer.denormalize(issue as NormalizedIssue);
    const { data } = await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(id),
      ...githubIssue
    });

    return this.normalizer.normalize(data as GitHubIssue);
  }

  async deleteIssue(id: string): Promise<void> {
    // GitHub doesn't support deleting issues, so we'll close it instead
    await this.octokit.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: parseInt(id),
      state: 'closed'
    });
  }

  async getLabels(): Promise<NormalizedLabel[]> {
    const { data } = await this.octokit.issues.listLabelsForRepo({
      owner: this.owner,
      repo: this.repo
    });

    return data.map(label => ({
      name: label.name,
      color: label.color ? `#${label.color}` : undefined,
      description: label.description || undefined
    }));
  }

  async getStates(): Promise<NormalizedState[]> {
    return [
      {
        category: NormalizedStateCategory.Todo,
        name: 'Open'
      },
      {
        category: NormalizedStateCategory.Done,
        name: 'Closed'
      }
    ];
  }

  getName(): string {
    return 'github';
  }

  getStateMappingConfig(): StateMappingConfig {
    return {
      stateMapping: {
        'open': NormalizedStateCategory.Backlog,
        'closed': NormalizedStateCategory.Done
      },
      defaultCategory: NormalizedStateCategory.Backlog
    };
  }

  isSourceOfTruth(issue: NormalizedIssue): boolean {
    return issue.sourceProvider === 'github';
  }

  mapState(state: NormalizedState): IssueState {
    const category = state.category.replace('_', '') as 'backlog' | 'todo' | 'in_progress' | 'ready' | 'done';
    return {
      id: '',
      name: state.name,
      category,
      color: state.color
    };
  }
}
