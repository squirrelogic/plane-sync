import { IssueChange, IssueConflict, SyncResult } from '../types/index.js';
import { RepoProvider } from '../providers/repo-provider.js';
import { NormalizedIssue, NormalizedStateCategory, NormalizedLabel } from '../types/normalized.js';

export class SyncService {
  constructor(
    private sourceProvider: RepoProvider,
    private targetProvider: RepoProvider
  ) {}

  async sync(): Promise<SyncResult> {
    let sourceIssues: NormalizedIssue[];
    let targetIssues: NormalizedIssue[];

    try {
      sourceIssues = await this.sourceProvider.getIssues();
    } catch (error) {
      if (error instanceof Error && error.message === 'API rate limit exceeded') {
        // Wait and retry once for rate limit errors
        await new Promise((resolve) => setTimeout(resolve, 1000));
        sourceIssues = await this.sourceProvider.getIssues();
      } else {
        throw error;
      }
    }

    try {
      targetIssues = await this.targetProvider.getIssues();
    } catch (error) {
      if (error instanceof Error && error.message === 'API rate limit exceeded') {
        // Wait and retry once for rate limit errors
        await new Promise((resolve) => setTimeout(resolve, 1000));
        targetIssues = await this.targetProvider.getIssues();
      } else {
        throw error;
      }
    }

    const changes: IssueChange[] = [];
    const conflicts: IssueConflict[] = [];
    const errors: Error[] = [];

    // Process source to target sync
    for (const sourceIssue of sourceIssues) {
      try {
        const matchingTargetIssue = targetIssues.find(
          (target) =>
            target.metadata?.externalId === sourceIssue.id ||
            (target.title === sourceIssue.title &&
              target.description === sourceIssue.description) ||
            (target.metadata?.provider === this.sourceProvider.getName() &&
              target.metadata?.externalId === sourceIssue.id)
        );

        if (matchingTargetIssue) {
          const sourceDate = new Date(sourceIssue.updatedAt);
          const targetDate = new Date(matchingTargetIssue.updatedAt);

          // Check for conflicts when timestamps match
          if (sourceDate.getTime() === targetDate.getTime()) {
            const conflictingFields = this.getConflictingFields(sourceIssue, matchingTargetIssue);
            if (conflictingFields.length > 0) {
              conflicts.push({
                sourceIssue,
                targetIssue: matchingTargetIssue,
                lastSyncHash: '',
                conflictingFields: conflictingFields.map((field) => ({
                  field,
                  sourceValue: sourceIssue[field as keyof NormalizedIssue],
                  targetValue: matchingTargetIssue[field as keyof NormalizedIssue],
                })),
              });
              continue;
            }
          }

          // Update if source is newer
          if (sourceDate > targetDate) {
            const updateData: Partial<NormalizedIssue> = {
              title: sourceIssue.title,
              description: sourceIssue.description,
              state: sourceIssue.state,
              labels: sourceIssue.labels,
              assignees: sourceIssue.assignees,
            };

            // Only include metadata if it's a new link
            if (!matchingTargetIssue.metadata?.externalId) {
              updateData.metadata = {
                externalId: sourceIssue.id,
                provider: this.sourceProvider.getName(),
              };
            }

            await this.targetProvider.updateIssue(matchingTargetIssue.id, updateData);
            changes.push({ source: this.sourceProvider.getName(), issue: sourceIssue });
          }
        } else {
          // Create new issue
          const createdIssue = await this.targetProvider.createIssue({
            title: sourceIssue.title,
            description: sourceIssue.description,
            state: sourceIssue.state,
            labels: sourceIssue.labels,
            assignees: sourceIssue.assignees,
            metadata: {
              externalId: sourceIssue.id,
              provider: this.sourceProvider.getName(),
            },
          });
          changes.push({ source: this.sourceProvider.getName(), issue: createdIssue });
        }
      } catch (error) {
        errors.push(error as Error);
      }
    }

    // Process target to source sync
    for (const targetIssue of targetIssues) {
      try {
        if (targetIssue.metadata?.provider === this.sourceProvider.getName()) {
          const sourceIssueExists = sourceIssues.some(
            (source) => source.id === targetIssue.metadata?.externalId
          );

          if (!sourceIssueExists) {
            // Source issue was deleted, mark target as cancelled
            await this.targetProvider.updateIssue(targetIssue.id, {
              state: {
                category: NormalizedStateCategory.Done,
                name: 'Cancelled',
              },
            });
            changes.push({ source: this.targetProvider.getName(), issue: targetIssue });
          }
        } else {
          // Create in source if no reference exists
          const createdIssue = await this.sourceProvider.createIssue({
            title: targetIssue.title,
            description: targetIssue.description,
            state: targetIssue.state,
            labels: targetIssue.labels,
            assignees: targetIssue.assignees,
            metadata: {
              externalId: targetIssue.id,
              provider: this.targetProvider.getName(),
            },
          });
          changes.push({ source: this.sourceProvider.getName(), issue: createdIssue });

          // Update target with source reference
          await this.targetProvider.updateIssue(targetIssue.id, {
            metadata: {
              externalId: createdIssue.id,
              provider: this.sourceProvider.getName(),
            },
          });
        }
      } catch (error) {
        errors.push(error as Error);
      }
    }

    return {
      sourceToTargetChanges: changes.filter(
        (change) => change.source === this.sourceProvider.getName()
      ),
      targetToSourceChanges: changes.filter(
        (change) => change.source === this.targetProvider.getName()
      ),
      conflicts,
      errors,
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
