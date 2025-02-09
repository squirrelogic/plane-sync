import { Issue, IssueState, Label } from '../types';
import { NormalizedIssue, NormalizedLabel, NormalizedState, StateMappingConfig } from '../types/normalized';

export interface RepoProvider {
  /**
   * Get all issues from the repository in normalized form
   */
  getIssues(): Promise<NormalizedIssue[]>;

  /**
   * Get a single issue by ID in normalized form
   */
  getIssue(id: string): Promise<NormalizedIssue>;

  /**
   * Create a new issue from a normalized issue
   */
  createIssue(issue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'>): Promise<NormalizedIssue>;

  /**
   * Update an existing issue using normalized data
   */
  updateIssue(id: string, issue: Partial<NormalizedIssue>): Promise<NormalizedIssue>;

  /**
   * Delete an issue
   */
  deleteIssue(id: string): Promise<void>;

  /**
   * Get all available labels in normalized form
   */
  getLabels(): Promise<NormalizedLabel[]>;

  /**
   * Get all available states in normalized form
   */
  getStates(): Promise<NormalizedState[]>;

  /**
   * Get the provider's name (e.g., 'github', 'plane', 'jira')
   */
  getName(): string;

  /**
   * Get the state mapping configuration for this provider
   */
  getStateMappingConfig(): StateMappingConfig;

  /**
   * Check if this provider is the source of truth for an issue
   */
  isSourceOfTruth(issue: NormalizedIssue): boolean;

  /**
   * Map a normalized state to a provider-specific state
   */
  mapState(state: NormalizedState): IssueState;
}
