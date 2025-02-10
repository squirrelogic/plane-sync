import { RepoProvider } from './repo-provider.js';
import {
  NormalizedIssue,
  NormalizedLabel,
  NormalizedState,
  StateMappingConfig,
  NormalizedStateCategory,
} from '../types/normalized.js';
import { IssueState } from '../types/index.js';
import { PlaneNormalizer } from '../normalizers/plane-normalizer.js';
import {
  PlaneClient,
  PlaneIssue,
  PlaneState,
  PlaneLabel,
  CreatePlaneIssueData,
  UpdatePlaneIssueData,
} from '../clients/plane-client.js';
import { BaseProvider } from './base-provider.js';
import { BaseIssue } from '../clients/base-client.js';

export class PlaneProvider extends BaseProvider implements RepoProvider {
  protected readonly name = 'plane';
  protected readonly stateMappingConfig: StateMappingConfig = {
    stateMapping: {
      backlog: NormalizedStateCategory.Backlog,
      todo: NormalizedStateCategory.Todo,
      in_progress: NormalizedStateCategory.InProgress,
      ready: NormalizedStateCategory.Ready,
      done: NormalizedStateCategory.Done,
    },
    defaultCategory: NormalizedStateCategory.Backlog,
  };
  public readonly normalizer: PlaneNormalizer;
  private propertyCache: Map<string, { id: string; name: string }> = new Map();

  constructor(
    private client: PlaneClient,
    private workspaceId: string,
    private projectId: string
  ) {
    super();
    this.normalizer = new PlaneNormalizer(client, workspaceId, projectId);
    this.initializePropertyCache();
  }

  private get projectRef(): string {
    return `${this.workspaceId}/${this.projectId}`;
  }

  private async initializePropertyCache(): Promise<void> {
    const properties = await this.client.getProperties(this.projectRef);
    if (properties) {
      properties.forEach((prop: { id: string; name: string }) => {
        this.propertyCache.set(prop.name, { id: prop.id, name: prop.name });
      });
    }
  }

  private async getStateIdFromName(name: string): Promise<string> {
    const states = await this.client.getStates(this.projectRef);
    const state = states.find((s: PlaneState) => s.name.toLowerCase() === name.toLowerCase());
    if (!state) {
      throw new Error(`State not found: ${name}`);
    }
    return state.id;
  }

  private async getLabelIdFromName(name: string): Promise<string> {
    const labels = await this.client.getLabels(this.projectRef);
    const label = labels.find((l: PlaneLabel) => l.name.toLowerCase() === name.toLowerCase());
    if (!label) {
      throw new Error(`Label not found: ${name}`);
    }
    return label.id;
  }

  private async getPropertyIdFromName(name: string): Promise<string> {
    const cached = this.propertyCache.get(name);
    if (cached) {
      return cached.id;
    }

    // If not in cache, refresh the cache and try again
    await this.initializePropertyCache();
    const refreshed = this.propertyCache.get(name);
    if (!refreshed) {
      throw new Error(`Property not found: ${name}`);
    }
    return refreshed.id;
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
        description: undefined,
      },
      labels: baseIssue.labels.map((label) => ({
        id: label.metadata?.id || '',
        name: label.name,
        color: label.color || '#000000',
        description: label.description,
      })),
      assignee_ids: baseIssue.metadata?.assigneeIds || [],
      created_at: baseIssue.createdAt,
      updated_at: baseIssue.updatedAt,
      metadata: baseIssue.metadata,
    };
  }

  async getIssues(): Promise<NormalizedIssue[]> {
    const issues = await this.client.listIssues(this.projectRef);
    const planeIssues = issues.map((issue) => ({
      ...this.convertBaseToPlaneIssue(issue),
      name: issue.title,
      assignee_ids: issue.metadata?.assigneeIds || [],
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
    }));
    return Promise.all(planeIssues.map((issue) => this.normalizer.normalize(issue)));
  }

  async getIssue(id: string): Promise<NormalizedIssue> {
    const issue = await this.client.getIssue(this.projectRef, id);
    const planeIssue = {
      ...this.convertBaseToPlaneIssue(issue),
      name: issue.title,
      assignee_ids: issue.metadata?.assigneeIds || [],
      created_at: issue.createdAt,
      updated_at: issue.updatedAt,
    };
    return this.normalizer.normalize(planeIssue);
  }

  async createIssue(
    issue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'>
  ): Promise<NormalizedIssue> {
    const stateId = issue.state.metadata?.id || (await this.getStateIdFromName(issue.state.name));
    const labelIds = await Promise.all(
      issue.labels.map((label) => label.metadata?.id || this.getLabelIdFromName(label.name))
    );

    const data: CreatePlaneIssueData = {
      title: issue.title,
      name: issue.title,
      description: issue.description,
      state: stateId,
      state_id: stateId,
      label_ids: labelIds,
      labels: labelIds,
      assignee_ids: issue.assignees || [],
      metadata: {
        externalId: issue.metadata?.externalId,
        provider: issue.metadata?.provider,
      },
    };

    const planeIssue = await this.client.createIssue(this.projectRef, data);
    return this.normalizer.normalize({
      ...planeIssue,
      name: planeIssue.title,
      assignee_ids: planeIssue.metadata?.assigneeIds || [],
      created_at: planeIssue.createdAt,
      updated_at: planeIssue.updatedAt,
    });
  }

  async updateIssue(id: string, issue: Partial<NormalizedIssue>): Promise<NormalizedIssue> {
    const stateId =
      issue.state?.metadata?.id ||
      (issue.state?.name ? await this.getStateIdFromName(issue.state.name) : undefined);
    const labelIds = issue.labels
      ? await Promise.all(
          issue.labels.map((label) => label.metadata?.id || this.getLabelIdFromName(label.name))
        )
      : [];

    const data: UpdatePlaneIssueData = {
      title: issue.title,
      name: issue.title,
      description: issue.description,
      state: stateId,
      state_id: stateId,
      label_ids: labelIds,
      labels: labelIds,
      assignee_ids: issue.assignees,
      metadata: issue.metadata,
    };

    const planeIssue = await this.client.updateIssue(this.projectRef, id, data);
    return this.normalizer.normalize({
      ...planeIssue,
      name: planeIssue.title,
      assignee_ids: planeIssue.metadata?.assigneeIds || [],
      created_at: planeIssue.createdAt,
      updated_at: planeIssue.updatedAt,
    });
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
      metadata: { id: label.id },
    }));
  }

  async getStates(): Promise<NormalizedState[]> {
    const states = await this.client.getStates(this.projectRef);
    return states.map((state) => ({
      category: this.getCategoryFromName(state.name),
      name: state.name,
      color: state.color,
      metadata: { id: state.id },
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
    const category = state.category.replace('_', '') as
      | 'backlog'
      | 'todo'
      | 'in_progress'
      | 'ready'
      | 'done';
    return {
      id: state.metadata?.id || '',
      name: state.name,
      category,
      color: state.color,
    };
  }
}
