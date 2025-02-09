import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized';
import { IssueNormalizer } from './issue-normalizer';
import { PlaneClient, PlaneIssue, CreateIssueData } from '../clients/plane-client';

export class PlaneNormalizer implements IssueNormalizer<PlaneIssue, CreateIssueData> {
  private stateCache: Map<string, { id: string; name: string; color?: string }> = new Map();
  private labelCache: Map<string, { id: string; name: string; color?: string; description?: string }> = new Map();

  constructor(
    private client: PlaneClient,
    private workspaceId: string,
    private projectId: string
  ) {}

  async initialize(): Promise<void> {
    const [states, labels] = await Promise.all([
      this.client.getStates(this.workspaceId, this.projectId),
      this.client.getLabels(this.workspaceId, this.projectId)
    ]);

    states.forEach(state => {
      this.stateCache.set(state.name.toLowerCase(), state);
    });

    labels.forEach(label => {
      this.labelCache.set(label.name.toLowerCase(), label);
    });
  }

  async normalize(issue: PlaneIssue): Promise<NormalizedIssue> {
    const [states, labels] = await Promise.all([
      this.client.getStates(this.workspaceId, this.projectId),
      this.client.getLabels(this.workspaceId, this.projectId)
    ]);

    return {
      id: issue.id,
      title: issue.name,
      description: issue.description || '',
      state: await this.normalizeState(issue.state, states),
      labels: await this.normalizeLabels(issue.labels, labels),
      assignees: issue.assignee_ids || [],
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      sourceProvider: 'plane',
      metadata: {
        stateId: issue.state.id,
        ...(issue.metadata || {})
      }
    };
  }

  async denormalize(issue: NormalizedIssue): Promise<CreateIssueData> {
    const [states, labels] = await Promise.all([
      this.client.getStates(this.workspaceId, this.projectId),
      this.client.getLabels(this.workspaceId, this.projectId)
    ]);

    return {
      name: issue.title,
      description: issue.description,
      state_id: (await this.denormalizeState(issue.state, states)).id,
      label_ids: await this.denormalizeLabels(issue.labels, labels),
      assignee_ids: issue.assignees,
      metadata: issue.metadata || {}
    };
  }

  private async ensureInitialized(): Promise<void> {
    if (this.stateCache.size === 0 || this.labelCache.size === 0) {
      await this.initialize();
    }
  }

  private getStateCategory(stateName: string): NormalizedStateCategory {
    const name = stateName.toLowerCase();
    if (name.includes('backlog')) return NormalizedStateCategory.Backlog;
    if (name.includes('todo') || name.includes('to do')) return NormalizedStateCategory.Todo;
    if (name.includes('progress') || name.includes('doing')) return NormalizedStateCategory.InProgress;
    if (name.includes('ready') || name.includes('review')) return NormalizedStateCategory.Ready;
    if (name.includes('done') || name.includes('completed')) return NormalizedStateCategory.Done;
    return NormalizedStateCategory.Backlog;
  }

  private async getOrCreateLabelIds(labels: Array<{ name: string; color?: string; description?: string }>): Promise<string[]> {
    const labelIds: string[] = [];

    for (const label of labels) {
      const existingLabel = this.labelCache.get(label.name.toLowerCase());
      if (existingLabel) {
        labelIds.push(existingLabel.id);
      } else {
        const newLabel = await this.client.createLabel(this.workspaceId, this.projectId, {
          name: label.name,
          color: label.color || '#000000',
          description: label.description
        });
        this.labelCache.set(newLabel.name.toLowerCase(), newLabel);
        labelIds.push(newLabel.id);
      }
    }

    return labelIds;
  }

  private async normalizeState(state: { name: string; color?: string }, states: Array<{ name: string; color?: string }>): Promise<{ category: NormalizedStateCategory; name: string; color?: string }> {
    const normalizedState = states.find(s => s.name.toLowerCase() === state.name.toLowerCase());
    if (normalizedState) {
      return {
        category: this.getStateCategory(normalizedState.name),
        name: normalizedState.name,
        color: normalizedState.color
      };
    }
    // If state not found, return a default state
    return {
      category: NormalizedStateCategory.Backlog,
      name: state.name,
      color: state.color
    };
  }

  private async normalizeLabels(labels: Array<{ name: string; color?: string; description?: string }>, allLabels: Array<{ name: string; color?: string }>): Promise<Array<{ name: string; color?: string; description?: string }>> {
    const normalizedLabels: Array<{ name: string; color?: string; description?: string }> = [];

    for (const label of labels) {
      const normalizedLabel = allLabels.find(l => l.name.toLowerCase() === label.name.toLowerCase());
      if (normalizedLabel) {
        normalizedLabels.push({
          name: normalizedLabel.name,
          color: normalizedLabel.color,
          description: label.description
        });
      } else {
        const newLabel = await this.client.createLabel(this.workspaceId, this.projectId, {
          name: label.name,
          color: label.color || '#000000',
          description: label.description
        });
        this.labelCache.set(newLabel.name.toLowerCase(), newLabel);
        normalizedLabels.push({
          name: newLabel.name,
          color: newLabel.color,
          description: label.description
        });
      }
    }

    return normalizedLabels;
  }

  private async denormalizeState(state: { category: NormalizedStateCategory; name: string; color?: string }, states: Array<{ name: string; id: string; color?: string }>): Promise<{ id: string; name: string; color?: string }> {
    const normalizedState = states.find(s => s.name.toLowerCase() === state.name.toLowerCase());
    if (normalizedState) {
      return {
        id: normalizedState.id,
        name: normalizedState.name,
        color: normalizedState.color
      };
    }
    throw new Error(`Could not find state with name ${state.name}`);
  }

  private async denormalizeLabels(labels: Array<{ name: string; color?: string; description?: string }>, allLabels: Array<{ name: string; id: string; color?: string }>): Promise<string[]> {
    const labelIds: string[] = [];

    // First update cache with all labels
    allLabels.forEach(label => {
      this.labelCache.set(label.name.toLowerCase(), label);
    });

    for (const label of labels) {
      const existingLabel = this.labelCache.get(label.name.toLowerCase());
      if (existingLabel) {
        labelIds.push(existingLabel.id);
      } else {
        const newLabel = await this.client.createLabel(this.workspaceId, this.projectId, {
          name: label.name,
          color: label.color || '#000000',
          description: label.description
        });
        this.labelCache.set(newLabel.name.toLowerCase(), newLabel);
        labelIds.push(newLabel.id);
      }
    }

    return labelIds;
  }
}
