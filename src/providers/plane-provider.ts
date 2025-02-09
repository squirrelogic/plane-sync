import { RepoProvider } from './repo-provider';
import { NormalizedIssue, NormalizedLabel, NormalizedState, StateMappingConfig, NormalizedStateCategory } from '../types/normalized';
import { IssueState } from '../types';
import { PlaneNormalizer } from '../normalizers/plane-normalizer';
import { PlaneClient, PlaneIssue, CreatePlaneIssueData, UpdatePlaneIssueData } from '../clients/plane-client';
import { BaseProvider } from './base-provider';
import { BaseIssue } from '../clients/base-client';

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

  constructor(
    private client: PlaneClient,
    private workspaceId: string,
    private projectId: string
  ) {
    super();
    this.normalizer = new PlaneNormalizer(client, workspaceId, projectId);
  }

  private get projectRef(): string {
    return `${this.workspaceId}/${this.projectId}`;
  }

  private convertBaseToPlaneIssue(baseIssue: BaseIssue): PlaneIssue {
    return {
      id: baseIssue.id,
      name: baseIssue.title,
      description: baseIssue.description,
      state: {
        id: baseIssue.metadata?.stateId || '',
        name: baseIssue.state.name,
        color: baseIssue.state.color || '#000000',
        description: undefined
      },
      labels: baseIssue.labels.map(label => ({
        id: label.metadata?.id || '',
        name: label.name,
        color: label.color || '#000000',
        description: label.description
      })),
      assignee_ids: baseIssue.metadata?.assigneeIds || [],
      created_at: baseIssue.createdAt,
      updated_at: baseIssue.updatedAt,
      metadata: baseIssue.metadata
    };
  }

  async getIssues(): Promise<NormalizedIssue[]> {
    const issues = await this.client.listIssues(this.projectRef);
    return Promise.all(issues.map(issue => this.normalizer.normalize(this.convertBaseToPlaneIssue(issue))));
  }

  async getIssue(id: string): Promise<NormalizedIssue> {
    const issue = await this.client.getIssue(this.projectRef, id);
    return this.normalizer.normalize(this.convertBaseToPlaneIssue(issue));
  }

  async createIssue(issue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'>): Promise<NormalizedIssue> {
    const planeIssue: CreatePlaneIssueData = {
      title: issue.title,
      name: issue.title,
      description: issue.description,
      state: issue.state.metadata?.id || '',
      state_id: issue.state.metadata?.id || '',
      labels: issue.labels?.map(l => l.metadata?.id || '') || [],
      label_ids: issue.labels?.map(l => l.metadata?.id || '') || [],
      assignee_ids: issue.assignees,
      metadata: {
        externalId: issue.metadata?.externalId,
        provider: issue.metadata?.provider
      }
    };

    const createdIssue = await this.client.createIssue(this.projectRef, planeIssue);
    return this.normalizer.normalize(this.convertBaseToPlaneIssue(createdIssue));
  }

  async updateIssue(id: string, issue: Partial<NormalizedIssue>): Promise<NormalizedIssue> {
    const planeIssue: UpdatePlaneIssueData = {
      title: issue.title,
      name: issue.title,
      description: issue.description,
      state: issue.state?.metadata?.id || '',
      state_id: issue.state?.metadata?.id || '',
      labels: issue.labels?.map(l => l.metadata?.id || '') || [],
      label_ids: issue.labels?.map(l => l.metadata?.id || '') || [],
      assignee_ids: issue.assignees
    };

    const updatedIssue = await this.client.updateIssue(this.projectRef, id, planeIssue);
    return this.normalizer.normalize(this.convertBaseToPlaneIssue(updatedIssue));
  }

  async deleteIssue(id: string): Promise<void> {
    await this.client.deleteIssue(this.projectRef, id);
  }

  async getLabels(): Promise<NormalizedLabel[]> {
    const labels = await this.client.getLabels(this.projectRef);
    return labels.map(label => ({
      name: label.name,
      color: label.color,
      description: label.description,
      metadata: { id: label.id }
    }));
  }

  async getStates(): Promise<NormalizedState[]> {
    const states = await this.client.getStates(this.projectRef);
    return states.map(state => ({
      category: this.getCategoryFromName(state.name),
      name: state.name,
      color: state.color,
      metadata: { id: state.id }
    }));
  }

  private getCategoryFromName(name: string): NormalizedStateCategory {
    const lowerName = name.toLowerCase();
    if (lowerName.includes('backlog')) return NormalizedStateCategory.Backlog;
    if (lowerName.includes('todo')) return NormalizedStateCategory.Todo;
    if (lowerName.includes('in progress')) return NormalizedStateCategory.InProgress;
    if (lowerName.includes('ready')) return NormalizedStateCategory.Ready;
    if (lowerName.includes('done')) return NormalizedStateCategory.Done;
    return NormalizedStateCategory.Backlog;
  }

  getName(): string {
    return 'plane';
  }

  getStateMappingConfig(): StateMappingConfig {
    return this.stateMappingConfig;
  }

  isSourceOfTruth(issue: NormalizedIssue): boolean {
    return issue.sourceProvider === 'plane';
  }

  mapState(state: NormalizedState): IssueState {
    const category = state.category.replace('_', '') as 'backlog' | 'todo' | 'in_progress' | 'ready' | 'done';
    return {
      id: state.metadata?.id || '',
      name: state.name,
      category,
      color: state.color
    };
  }
}
