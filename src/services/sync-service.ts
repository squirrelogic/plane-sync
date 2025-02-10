import {
  Issue,
  IssueState,
  SyncResult,
  Label,
  IssueChange,
  IssueConflict,
} from '../types/index.js';
import { RepoProvider } from '../providers/repo-provider.js';
import { NormalizedIssue, NormalizedStateCategory, NormalizedLabel } from '../types/normalized.js';

export class SyncService {
  constructor(
    private sourceProvider: RepoProvider,
    private targetProvider: RepoProvider
  ) {}

  async sync(): Promise<SyncResult> {
    const sourceIssues = await this.sourceProvider.getIssues();
    const targetIssues = await this.targetProvider.getIssues();

    // Create maps for faster lookups
    const sourceMap = new Map(sourceIssues.map((issue: NormalizedIssue) => [issue.id, issue]));
    const targetMap = new Map(targetIssues.map((issue: NormalizedIssue) => [issue.id, issue]));

    const sourceToTargetChanges: IssueChange[] = sourceIssues.map((issue) => ({
      source: this.sourceProvider.getName(),
      issue,
    }));

    const targetToSourceChanges: IssueChange[] = targetIssues.map((issue) => ({
      source: this.targetProvider.getName(),
      issue,
    }));

    const conflicts: IssueConflict[] = sourceIssues
      .map((sourceIssue) => {
        const targetIssue = targetMap.get(sourceIssue.id);
        if (!targetIssue) return null;

        const conflictingFields = this.getConflictingFields(sourceIssue, targetIssue);
        if (conflictingFields.length === 0) return null;

        return {
          sourceIssue,
          targetIssue,
          lastSyncHash: '',
          conflictingFields: conflictingFields.map((field) => ({
            field,
            sourceValue: sourceIssue[field as keyof NormalizedIssue],
            targetValue: targetIssue[field as keyof NormalizedIssue],
          })),
        };
      })
      .filter((conflict): conflict is NonNullable<typeof conflict> => conflict !== null);

    return {
      sourceToTargetChanges,
      targetToSourceChanges,
      conflicts,
      errors: [],
    };
  }

  private hasChanges(source: NormalizedIssue, target: NormalizedIssue): boolean {
    // Compare fields that can change
    if (source.title !== target.title) return true;
    if (source.description !== target.description) return true;
    if (source.state.name !== target.state.name) return true;

    // Compare labels
    const sourceLabels = new Set(source.labels.map((l: NormalizedLabel) => l.name.toLowerCase()));
    const targetLabels = new Set(target.labels.map((l: NormalizedLabel) => l.name.toLowerCase()));

    if (sourceLabels.size !== targetLabels.size) return true;
    for (const label of sourceLabels) {
      if (!targetLabels.has(label)) return true;
    }

    return false;
  }

  private getConflictingFields(source: NormalizedIssue, target: NormalizedIssue): string[] {
    const fields: (keyof NormalizedIssue)[] = ['title', 'description', 'state', 'labels'];
    return fields.filter((field) => {
      if (field === 'state') {
        return source.state.name !== target.state.name;
      }
      if (field === 'labels') {
        const sourceLabels = new Set(source.labels.map((l) => l.name.toLowerCase()));
        const targetLabels = new Set(target.labels.map((l) => l.name.toLowerCase()));
        return (
          sourceLabels.size !== targetLabels.size ||
          ![...sourceLabels].every((name) => targetLabels.has(name))
        );
      }
      return source[field] !== target[field];
    });
  }
}
