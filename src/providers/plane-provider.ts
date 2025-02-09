import { RepoProvider } from './repo-provider';
import { NormalizedIssue, NormalizedLabel, NormalizedState, StateMappingConfig, NormalizedStateCategory } from '../types/normalized';
import { IssueState } from '../types';
import { PlaneNormalizer } from '../normalizers/plane-normalizer';
import { PlaneClient, PlaneIssue, CreateIssueData } from '../clients/plane-client';
import { BaseProvider } from './base-provider';

export class PlaneProvider extends BaseProvider implements RepoProvider {
  protected readonly name = 'plane';
  protected readonly stateMappingConfig: StateMappingConfig = {
    stateMapping: {
      backlog: NormalizedStateCategory.Backlog,
      todo: NormalizedStateCategory.Todo,
      in_progress: NormalizedStateCategory.InProgress,
      ready: NormalizedStateCategory.Ready,
      done: NormalizedStateCategory.Done
    },
    defaultCategory: NormalizedStateCategory.Backlog
  };
  public readonly normalizer: PlaneNormalizer;
  private readonly client: PlaneClient;
  private readonly workspaceId: string;
  private readonly projectId: string;

  constructor(client: PlaneClient, workspaceId: string, projectId: string) {
    super();
    this.client = client;
    this.workspaceId = workspaceId;
    this.projectId = projectId;
    this.normalizer = new PlaneNormalizer(client, workspaceId, projectId);
  }

  async getIssues(): Promise<NormalizedIssue[]> {
    const issues = await this.client.getIssues(this.workspaceId, this.projectId);
    return Promise.all(issues.map(issue => this.normalizer.normalize(issue)));
  }

  async getIssue(id: string): Promise<NormalizedIssue> {
    const issue = await this.client.getIssue(this.workspaceId, this.projectId, id);
    return this.normalizer.normalize(issue);
  }

  async createIssue(issue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'>): Promise<NormalizedIssue> {
    const planeIssue = await this.normalizer.denormalize(issue as NormalizedIssue);
    const createdIssue = await this.client.createIssue(this.workspaceId, this.projectId, {
      ...planeIssue,
      state_id: planeIssue.state_id || (await this.getDefaultStateId())
    });
    return this.normalizer.normalize(createdIssue);
  }

  async updateIssue(id: string, issue: Partial<NormalizedIssue>): Promise<NormalizedIssue> {
    const planeIssue = await this.normalizer.denormalize(issue as NormalizedIssue);
    const updatedIssue = await this.client.updateIssue(this.workspaceId, this.projectId, id, planeIssue);
    return this.normalizer.normalize(updatedIssue);
  }

  async deleteIssue(id: string): Promise<void> {
    await this.client.deleteIssue(this.workspaceId, this.projectId, id);
  }

  async getLabels(): Promise<NormalizedLabel[]> {
    const labels = await this.client.getLabels(this.workspaceId, this.projectId);
    return labels.map(label => ({
      name: label.name,
      color: label.color,
      description: label.description
    }));
  }

  async getStates(): Promise<NormalizedState[]> {
    const states = await this.client.getStates(this.workspaceId, this.projectId);
    return states.map(state => ({
      category: this.stateMappingConfig.stateMapping[state.name.toLowerCase()] || this.stateMappingConfig.defaultCategory,
      name: state.name,
      color: state.color
    }));
  }

  isSourceOfTruth(issue: NormalizedIssue): boolean {
    return issue.sourceProvider === 'plane';
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

  private async getDefaultStateId(): Promise<string> {
    const states = await this.client.getStates(this.workspaceId, this.projectId);
    const defaultState = states.find(state =>
      state.name.toLowerCase().includes('todo') ||
      state.name.toLowerCase().includes('to do')
    );
    return defaultState?.id || states[0].id;
  }
}
