import { RepoProvider } from './repo-provider.js';
import {
  NormalizedIssue,
  NormalizedLabel,
  NormalizedState,
  StateMappingConfig,
  NormalizedStateCategory,
} from '../types/normalized.js';
import { IssueState, Label } from '../types/index.js';
import {
  GitHubNormalizer,
  GitHubIssue,
  CreateGitHubIssue,
} from '../normalizers/github-normalizer.js';
import { BaseProvider } from './base-provider.js';
import { GitHubClient } from '../clients/github-client.js';
import { BaseIssue } from '../clients/base-client.js';

export class GitHubProvider extends BaseProvider implements RepoProvider {
  protected readonly name = 'github';
  protected readonly stateMappingConfig: StateMappingConfig = {
    stateMapping: {
      open: NormalizedStateCategory.Backlog,
      closed: NormalizedStateCategory.Done,
    },
    defaultCategory: NormalizedStateCategory.Backlog,
  };
  public readonly normalizer: GitHubNormalizer;

  constructor(
    private client: GitHubClient,
    private owner: string,
    private repo: string,
    private projectId?: number,
    private useProjectV2: boolean = false
  ) {
    super();
    this.normalizer = new GitHubNormalizer();
  }

  private get projectRef(): string {
    return `${this.owner}/${this.repo}`;
  }

  private convertBaseIssueToGitHub(baseIssue: BaseIssue): GitHubIssue {
    return {
      number: parseInt(baseIssue.id),
      title: baseIssue.title,
      body: baseIssue.description || '',
      state: baseIssue.state.name.toLowerCase() as 'open' | 'closed',
      labels: baseIssue.labels.map((label: Label) => ({
        name: label.name,
        color: label.color?.replace('#', ''),
        description: label.description,
      })),
      assignees: [],
      created_at: baseIssue.createdAt,
      updated_at: baseIssue.updatedAt,
      node_id: baseIssue.metadata?.nodeId || '',
    };
  }

  async getIssues(): Promise<NormalizedIssue[]> {
    const issues = await this.client.listIssues(this.projectRef);
    return Promise.all(
      issues.map((issue: BaseIssue) =>
        this.normalizer.normalize(this.convertBaseIssueToGitHub(issue))
      )
    );
  }

  async getIssue(id: string): Promise<NormalizedIssue> {
    const issue = await this.client.getIssue(this.projectRef, id);
    return this.normalizer.normalize(this.convertBaseIssueToGitHub(issue));
  }

  async createIssue(
    issue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'>
  ): Promise<NormalizedIssue> {
    const createdIssue = await this.client.createIssue(this.projectRef, {
      title: issue.title,
      description: issue.description,
      state: issue.state.name.toLowerCase(),
      labels: issue.labels?.map((l: NormalizedLabel) => l.name),
    });
    return this.normalizer.normalize(this.convertBaseIssueToGitHub(createdIssue));
  }

  async updateIssue(id: string, issue: Partial<NormalizedIssue>): Promise<NormalizedIssue> {
    const updateData = {
      title: issue.title,
      description: issue.description,
      state: issue.state?.name.toLowerCase(),
      labels: issue.labels?.map((l) => l.name),
    };

    const updatedIssue = await this.client.updateIssue(this.projectRef, id, updateData);
    return this.normalizer.normalize(this.convertBaseIssueToGitHub(updatedIssue));
  }

  async deleteIssue(id: string): Promise<void> {
    await this.client.deleteIssue(this.projectRef, id);
  }

  async getLabels(): Promise<NormalizedLabel[]> {
    const labels = await this.client.getLabels(this.projectRef);
    return labels.map((label) => ({
      name: label.name,
      color: label.color,
      description: label.description,
    }));
  }

  async getStates(): Promise<NormalizedState[]> {
    const states = await this.client.getStates(this.projectRef);
    return [
      {
        category: NormalizedStateCategory.Todo,
        name: 'Open',
      },
      {
        category: NormalizedStateCategory.Done,
        name: 'Closed',
      },
    ];
  }

  getName(): string {
    return 'github';
  }

  getStateMappingConfig(): StateMappingConfig {
    return {
      stateMapping: {
        open: NormalizedStateCategory.Backlog,
        closed: NormalizedStateCategory.Done,
      },
      defaultCategory: NormalizedStateCategory.Backlog,
    };
  }

  isSourceOfTruth(issue: NormalizedIssue): boolean {
    return issue.sourceProvider === 'github';
  }

  mapState(state: NormalizedState): IssueState {
    const category = state.category.replace('_', '') as
      | 'backlog'
      | 'todo'
      | 'in_progress'
      | 'ready'
      | 'done';
    return {
      id: '',
      name: state.name,
      category,
      color: state.color,
    };
  }
}
