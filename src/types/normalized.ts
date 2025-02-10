/**
 * Normalized state categories that all providers must map to
 */
export enum NormalizedStateCategory {
  Backlog = 'backlog',
  Todo = 'todo',
  InProgress = 'in_progress',
  Ready = 'ready',
  Done = 'done',
}

/**
 * Normalized issue state that providers map their states to
 */
export interface NormalizedState {
  category: NormalizedStateCategory;
  name: string; // Original state name from provider
  color?: string;
  metadata?: Record<string, any>;
}

/**
 * Normalized label that providers map their labels to
 */
export interface NormalizedLabel {
  name: string;
  color?: string;
  description?: string;
  metadata?: Record<string, any>;
}

/**
 * Normalized issue representation
 */
export interface NormalizedIssue {
  id: string;
  externalId?: string;
  title: string;
  description: string;
  state: NormalizedState;
  labels: NormalizedLabel[];
  assignees: string[];
  createdAt: string;
  updatedAt: string;
  metadata?: {
    externalId?: string;
    nodeId?: string;
    stateId?: string;
    provider?: string;
    [key: string]: any;
  };
  sourceProvider: string; // Name of the provider this issue came from
  properties?: Record<string, any>;
}

/**
 * Interface for mapping provider-specific states to normalized states
 */
export interface StateMapping {
  normalizedCategory: NormalizedStateCategory;
  providerStates: string[]; // List of provider state names that map to this category
}

/**
 * Configuration for state mappings in a provider
 */
export interface StateMappingConfig {
  /**
   * Map of provider state names (lowercase) to normalized state categories
   */
  stateMapping: Record<string, NormalizedStateCategory>;

  /**
   * Default state category to use when a state is not found in the mapping
   */
  defaultCategory: NormalizedStateCategory;
}

/**
 * Result of comparing two normalized issues
 */
export interface IssueComparison {
  hasChanges: boolean;
  conflicts: Array<{
    field: keyof NormalizedIssue;
    sourceValue: any;
    targetValue: any;
  }>;
}

/**
 * Provider-specific issue state
 */
export interface IssueState {
  id: string;
  name: string;
  color?: string;
}

/**
 * Helper functions for working with normalized issues
 */
export const NormalizedIssueUtils = {
  /**
   * Compare two normalized issues and return differences
   */
  compare(source: NormalizedIssue, target: NormalizedIssue): IssueComparison {
    const conflicts: IssueComparison['conflicts'] = [];
    const fields: (keyof NormalizedIssue)[] = [
      'title',
      'description',
      'state',
      'labels',
      'assignees',
    ];

    for (const field of fields) {
      if (field === 'state') {
        if (source.state.category !== target.state.category) {
          conflicts.push({
            field,
            sourceValue: source.state,
            targetValue: target.state,
          });
        }
      } else if (field === 'labels') {
        const sourceLabels = new Set(source.labels.map((l) => l.name.toLowerCase()));
        const targetLabels = new Set(target.labels.map((l) => l.name.toLowerCase()));
        if (
          sourceLabels.size !== targetLabels.size ||
          ![...sourceLabels].every((name) => targetLabels.has(name))
        ) {
          conflicts.push({
            field,
            sourceValue: source.labels,
            targetValue: target.labels,
          });
        }
      } else if (field === 'assignees') {
        const sourceAssignees = new Set(source.assignees);
        const targetAssignees = new Set(target.assignees);
        if (
          sourceAssignees.size !== targetAssignees.size ||
          ![...sourceAssignees].every((a) => targetAssignees.has(a))
        ) {
          conflicts.push({
            field,
            sourceValue: source.assignees,
            targetValue: target.assignees,
          });
        }
      } else if (source[field] !== target[field]) {
        conflicts.push({
          field,
          sourceValue: source[field],
          targetValue: target[field],
        });
      }
    }

    return {
      hasChanges: conflicts.length > 0,
      conflicts,
    };
  },

  /**
   * Create a normalized state from a category
   */
  createState(
    category: NormalizedStateCategory,
    originalName: string,
    color?: string
  ): NormalizedState {
    return {
      category,
      name: originalName,
      color,
    };
  },

  /**
   * Get the appropriate normalized state category based on a state name
   */
  getCategoryFromName(stateName: string, config: StateMappingConfig): NormalizedStateCategory {
    const name = stateName.toLowerCase();
    return config.stateMapping[name] || config.defaultCategory;
  },
};
