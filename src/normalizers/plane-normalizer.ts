import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized';
import { IssueNormalizer } from './issue-normalizer';
import { PlaneClient, PlaneIssue, CreatePlaneIssueData } from '../clients/plane-client';
import { BaseLabel } from '../clients/base-client';

export class PlaneNormalizer implements IssueNormalizer<PlaneIssue, CreatePlaneIssueData> {
  private stateCache: Map<string, { id: string; name: string; category: NormalizedStateCategory }> = new Map();
  private labelCache: Map<string, BaseLabel> = new Map();

  constructor(
    private client: PlaneClient,
    private workspaceId: string,
    private projectId: string
  ) {}

  private get projectRef(): string {
    return `${this.workspaceId}/${this.projectId}`;
  }

  async initialize(): Promise<void> {
    // Load states and labels into cache
    const [states, labels] = await Promise.all([
      this.client.getStates(this.projectRef),
      this.client.getLabels(this.projectRef)
    ]);

    // Cache states
    states.forEach(state => {
      this.stateCache.set(state.id, {
        id: state.id,
        name: state.name,
        category: this.getCategoryFromName(state.name)
      });
    });

    // Cache labels
    labels.forEach(label => {
      this.labelCache.set(label.name, label);
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
    // Ensure cache is initialized
    if (this.stateCache.size === 0) {
      await this.initialize();
    }

    const stateInfo = this.stateCache.get(issue.state.id) || {
      id: issue.state.id,
      name: issue.state.name,
      category: this.getCategoryFromName(issue.state.name)
    };

    // Handle labels - create them if they don't exist
    const normalizedLabels = await Promise.all(issue.labels.map(async label => {
      let existingLabel = this.labelCache.get(label.name);
      if (!existingLabel) {
        // Create new label if it doesn't exist
        existingLabel = await this.client.createLabel(this.projectRef, {
          name: label.name,
          color: label.color || '#000000',
          description: label.description
        });
        this.labelCache.set(label.name, existingLabel);
      }
      return {
        name: label.name,
        color: label.color,
        description: label.description,
        metadata: { id: existingLabel.id }
      };
    }));

    return {
      id: issue.id,
      title: issue.name,
      description: issue.description || '',
      state: {
        category: stateInfo.category,
        name: stateInfo.name,
        color: issue.state.color,
        metadata: { id: issue.state.id }
      },
      labels: normalizedLabels,
      assignees: issue.assignee_ids,
      createdAt: issue.created_at,
      updatedAt: issue.updated_at,
      metadata: {
        stateId: issue.state.id,
        ...issue.metadata
      },
      sourceProvider: 'plane'
    };
  }

  async denormalize(issue: NormalizedIssue): Promise<CreatePlaneIssueData> {
    // Ensure cache is initialized
    if (this.stateCache.size === 0) {
      await this.initialize();
    }

    // Find matching state ID
    let stateId = '';
    for (const [id, state] of this.stateCache.entries()) {
      if (state.category === issue.state.category) {
        stateId = id;
        break;
      }
    }

    // Handle labels
    const labelIds: string[] = [];
    for (const label of issue.labels) {
      let existingLabel = this.labelCache.get(label.name);
      if (!existingLabel) {
        // Create new label if it doesn't exist
        existingLabel = await this.client.createLabel(this.projectRef, {
          name: label.name,
          color: label.color || '#000000',
          description: label.description
        });
        this.labelCache.set(label.name, existingLabel);
      }
      labelIds.push(existingLabel.id);
    }

    return {
      title: issue.title,
      name: issue.title,
      description: issue.description,
      state: stateId,
      state_id: stateId,
      labels: labelIds,
      label_ids: labelIds,
      assignee_ids: issue.assignees,
      metadata: {
        externalId: issue.id,
        provider: issue.sourceProvider,
        ...issue.metadata
      }
    };
  }
}
