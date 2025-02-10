import {
  NormalizedIssue,
  NormalizedLabel,
  NormalizedState,
  StateMappingConfig,
  NormalizedStateCategory,
  NormalizedIssueUtils,
} from '../types/normalized.js';
import { IssueState } from '../types/index.js';
import { RepoProvider } from './repo-provider.js';

export abstract class BaseProvider implements RepoProvider {
  protected abstract readonly name: string;
  protected abstract readonly stateMappingConfig: StateMappingConfig;

  abstract getIssues(): Promise<NormalizedIssue[]>;
  abstract getIssue(id: string): Promise<NormalizedIssue>;
  abstract createIssue(
    issue: Omit<NormalizedIssue, 'id' | 'createdAt' | 'updatedAt' | 'sourceProvider'>
  ): Promise<NormalizedIssue>;
  abstract updateIssue(id: string, issue: Partial<NormalizedIssue>): Promise<NormalizedIssue>;
  abstract deleteIssue(id: string): Promise<void>;
  abstract getLabels(): Promise<NormalizedLabel[]>;
  abstract getStates(): Promise<NormalizedState[]>;
  abstract mapState(state: NormalizedState): IssueState;

  getName(): string {
    return this.name;
  }

  getStateMappingConfig(): StateMappingConfig {
    return this.stateMappingConfig;
  }

  isSourceOfTruth(issue: NormalizedIssue): boolean {
    return issue.sourceProvider === this.name;
  }

  protected normalizeState(stateName: string, color?: string): NormalizedState {
    const category = NormalizedIssueUtils.getCategoryFromName(stateName, this.stateMappingConfig);
    return NormalizedIssueUtils.createState(category, stateName, color);
  }

  protected compareIssues(source: NormalizedIssue, target: NormalizedIssue): string[] {
    const comparison = NormalizedIssueUtils.compare(source, target);
    return comparison.conflicts.map((c: { field: string }) => c.field);
  }

  protected getConflictingFields(
    comparison: { field: string; sourceValue: any; targetValue: any }[]
  ): string[] {
    return comparison.map((c: { field: string }) => c.field);
  }
}
