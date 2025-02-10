import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized';
import { IssueNormalizer } from './issue-normalizer';
import { PlaneClient, PlaneIssue, PlaneState, PlaneLabel } from '../clients/plane-client';
import { BaseIssue } from '../clients/base-client';

export class PlaneNormalizer implements IssueNormalizer<PlaneIssue, BaseIssue> {
  private stateCache: Map<string, PlaneState> = new Map();
  private labelCache: Map<string, PlaneLabel> = new Map();

  constructor(
    private client: PlaneClient,
    private workspaceId: string,
    private projectId: string
  ) {}

  async initialize(): Promise<void> {
    const states = await this.client.getStates(`${this.workspaceId}/${this.projectId}`);
    states.forEach(state => {
      this.stateCache.set(state.id, state);
    });

    // Clear and repopulate the label cache
    this.labelCache.clear();
    const labels = await this.client.getLabels(`${this.workspaceId}/${this.projectId}`);
    labels.forEach(label => {
      this.labelCache.set(label.id, label);
      // Also cache by name for faster lookups
      this.labelCache.set(label.name.toLowerCase(), label);
    });
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

  async normalize(issue: PlaneIssue): Promise<NormalizedIssue> {
    // Create any new labels that don't exist
    const labelPromises = issue.labels.map(async label => {
      const labelId = await this.getLabelIdFromName(label.name, label.color, label.description);
      return {
        name: label.name,
        color: label.color,
        description: label.description,
        metadata: { id: labelId }
      };
    });

    const normalizedLabels = await Promise.all(labelPromises);

    return {
      id: issue.id,
      title: issue.name,
      description: issue.description || '',
      state: {
        category: this.getCategoryFromName(issue.state.name),
        name: issue.state.name,
        color: issue.state.color,
        metadata: { id: issue.state.id }
      },
      labels: normalizedLabels,
      assignees: issue.assignee_ids,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      metadata: {
        ...issue.metadata,
        stateId: issue.state.id
      },
      sourceProvider: 'plane'
    };
  }

  async denormalize(issue: NormalizedIssue): Promise<BaseIssue> {
    const stateId = issue.state.metadata?.id || await this.getStateIdFromName(issue.state.name);

    // Refresh label cache if empty
    if (this.labelCache.size === 0) {
      const labels = await this.client.getLabels(`${this.workspaceId}/${this.projectId}`);
      for (const label of labels) {
        this.labelCache.set(label.id, label);
      }
    }

    const labelPromises = issue.labels.map(async label => {
      const labelId = await this.getLabelIdFromName(label.name, label.color, label.description);
      return {
        id: labelId,
        name: label.name,
        color: label.color,
        description: label.description
      };
    });

    const labels = await Promise.all(labelPromises);

    return {
      id: issue.id,
      title: issue.title,
      description: issue.description,
      state: {
        id: stateId,
        name: issue.state.name,
        color: issue.state.color
      },
      labels,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      metadata: {
        ...issue.metadata,
        stateId,
        assigneeIds: issue.assignees
      }
    };
  }

  private async getStateIdFromName(name: string): Promise<string> {
    const states = await this.client.getStates(`${this.workspaceId}/${this.projectId}`);
    const state = states.find(s => s.name.toLowerCase() === name.toLowerCase());
    if (!state) {
      throw new Error(`State not found: ${name}`);
    }
    return state.id;
  }

  private async getLabelIdFromName(name: string, color?: string, description?: string): Promise<string> {
    if (!name) {
      throw new Error('Label name is required');
    }

    // First check the cache by name
    const cachedLabel = this.labelCache.get(name.toLowerCase());
    if (cachedLabel) {
      return cachedLabel.id;
    }

    // If not in cache, try to find in all labels
    const labels = await this.client.getLabels(`${this.workspaceId}/${this.projectId}`);
    for (const label of labels) {
      this.labelCache.set(label.id, label);
      this.labelCache.set(label.name.toLowerCase(), label);
    }

    const existingLabel = labels.find(l => l && l.name && l.name.toLowerCase() === name.toLowerCase());
    if (existingLabel) {
      return existingLabel.id;
    }

    // If label doesn't exist, create it
    const newLabel = await this.client.createLabel(
      `${this.workspaceId}/${this.projectId}`,
      {
        name,
        color: color || '#000000', // Use provided color or default
        description
      }
    );
    this.labelCache.set(newLabel.id, newLabel);
    this.labelCache.set(newLabel.name.toLowerCase(), newLabel);
    return newLabel.id;
  }
}
