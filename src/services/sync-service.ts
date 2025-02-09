import { Issue, IssueState, SyncResult, Label } from '../types';
import { RepoProvider } from '../providers/repo-provider';
import { NormalizedIssue, NormalizedStateCategory } from '../types/normalized';

export class SyncService {
  constructor(
    private sourceProvider: RepoProvider,
    private targetProvider: RepoProvider
  ) {}

  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      sourceToTargetChanges: [],
      targetToSourceChanges: [],
      conflicts: [],
      errors: []
    };

    try {
      // Get all issues from both providers
      const [sourceIssues, targetIssues] = await Promise.all([
        this.sourceProvider.getIssues(),
        this.targetProvider.getIssues()
      ]);

      // Create lookup maps
      const sourceMap = new Map(sourceIssues.map(issue => [issue.id, issue]));

      // First try to find by external ID, then by matching title/description
      const targetMap = new Map();
      for (const issue of targetIssues) {
        if (issue.metadata?.externalId) {
          targetMap.set(issue.metadata.externalId, issue);
        } else if (sourceIssues.some(sourceIssue =>
          sourceIssue.title === issue.title &&
          sourceIssue.description === issue.description
        )) {
          const matchingSource = sourceIssues.find(sourceIssue =>
            sourceIssue.title === issue.title &&
            sourceIssue.description === issue.description
          );
          targetMap.set(matchingSource!.id, issue);
        } else {
          targetMap.set(issue.id, issue);
        }
      }

      // Process source issues
      for (const sourceIssue of sourceIssues) {
        const targetIssue = targetMap.get(sourceIssue.id);

        if (!targetIssue) {
          // Issue exists in source but not in target - create it
          await this.createIssueInTarget(sourceIssue);
          result.sourceToTargetChanges.push({
            source: this.sourceProvider.getName(),
            issue: sourceIssue
          });
          continue;
        }

        // If target issue exists but doesn't have external ID, update it
        if (!targetIssue.metadata?.externalId) {
          await this.updateIssueInTarget(targetIssue, sourceIssue);
          result.sourceToTargetChanges.push({
            source: this.sourceProvider.getName(),
            issue: sourceIssue
          });
          continue;
        }

        // Check if source is more recent
        const sourceDate = new Date(sourceIssue.updatedAt);
        const targetDate = new Date(targetIssue.updatedAt);

        if (sourceDate > targetDate) {
          // Source is more recent, update target
          await this.updateIssueInTarget(targetIssue, sourceIssue);
          result.sourceToTargetChanges.push({
            source: this.sourceProvider.getName(),
            issue: sourceIssue
          });
          continue;
        }

        // Check for conflicts only if source is not more recent
        const conflicts = this.detectConflicts(sourceIssue, targetIssue);
        if (conflicts.length > 0) {
          result.conflicts.push({
            sourceIssue,
            targetIssue,
            lastSyncHash: '',
            conflictingFields: conflicts.map(field => ({
              field,
              sourceValue: sourceIssue[field as keyof NormalizedIssue],
              targetValue: targetIssue[field as keyof NormalizedIssue]
            }))
          });
        }
      }

      // Check for issues that exist in target but not in source
      for (const targetIssue of targetIssues) {
        if (!targetIssue.metadata?.externalId && !sourceMap.has(targetIssue.id)) {
          // Issue exists only in target and has no external ID - create it in source
          const newIssue = await this.createIssueInSource(targetIssue);
          result.targetToSourceChanges.push({
            source: this.targetProvider.getName(),
            issue: targetIssue
          });

          // Update target with the new external ID
          await this.targetProvider.updateIssue(targetIssue.id, {
            metadata: {
              externalId: newIssue.id,
              provider: this.sourceProvider.getName()
            }
          });
        }
      }

      // Handle deleted source issues
      for (const targetIssue of targetIssues) {
        if (targetIssue.metadata?.externalId && !sourceMap.has(targetIssue.metadata.externalId)) {
          await this.targetProvider.updateIssue(targetIssue.id, {
            state: {
              category: NormalizedStateCategory.Done,
              name: 'Cancelled'
            }
          });
          result.sourceToTargetChanges.push({
            source: this.sourceProvider.getName(),
            issue: targetIssue
          });
        }
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('API rate limit exceeded')) {
        // Retry once after a delay
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.sync();
      }
      result.errors.push(error as Error);
    }

    return result;
  }

  private async createIssueInTarget(sourceIssue: NormalizedIssue): Promise<NormalizedIssue> {
    const metadata = {
      ...(sourceIssue.metadata || {}),
      externalId: sourceIssue.id,
      provider: this.sourceProvider.getName()
    };

    return await this.targetProvider.createIssue({
      title: sourceIssue.title,
      description: sourceIssue.description,
      state: sourceIssue.state,
      labels: sourceIssue.labels,
      assignees: sourceIssue.assignees,
      metadata
    });
  }

  private async createIssueInSource(targetIssue: NormalizedIssue): Promise<NormalizedIssue> {
    const metadata = {
      ...(targetIssue.metadata || {}),
      externalId: targetIssue.id,
      provider: this.targetProvider.getName()
    };

    return await this.sourceProvider.createIssue({
      title: targetIssue.title,
      description: targetIssue.description,
      state: targetIssue.state,
      labels: targetIssue.labels,
      assignees: targetIssue.assignees,
      metadata
    });
  }

  private async updateIssueInTarget(targetIssue: NormalizedIssue, sourceIssue: NormalizedIssue): Promise<NormalizedIssue> {
    const updateData: Partial<NormalizedIssue> = {
      title: sourceIssue.title,
      description: sourceIssue.description,
      state: sourceIssue.state,
      labels: sourceIssue.labels,
      assignees: sourceIssue.assignees
    };

    // Only update metadata if it's missing or incorrect
    if (!targetIssue.metadata?.externalId || targetIssue.metadata.externalId !== sourceIssue.id || targetIssue.metadata.provider !== this.sourceProvider.getName()) {
      updateData.metadata = {
        ...(targetIssue.metadata || {}),
        externalId: sourceIssue.id,
        provider: this.sourceProvider.getName()
      };
    }

    return await this.targetProvider.updateIssue(targetIssue.id, updateData);
  }

  private detectConflicts(sourceIssue: NormalizedIssue, targetIssue: NormalizedIssue): string[] {
    const conflicts: string[] = [];
    const fields: (keyof NormalizedIssue)[] = ['title', 'description', 'state', 'labels', 'assignees'];

    for (const field of fields) {
      if (field === 'state') {
        if (sourceIssue.state.category !== targetIssue.state.category) {
          conflicts.push(field);
        }
      } else if (field === 'labels') {
        if (!this.areLabelsEquivalent(sourceIssue.labels, targetIssue.labels)) {
          conflicts.push(field);
        }
      } else if (field === 'assignees') {
        if (!this.areAssigneesEquivalent(sourceIssue.assignees, targetIssue.assignees)) {
          conflicts.push(field);
        }
      } else {
        // For simple fields like title and description
        const sourceValue = sourceIssue[field];
        const targetValue = targetIssue[field];
        if (sourceValue !== targetValue) {
          conflicts.push(field);
        }
      }
    }

    // If no conflicts but source is more recent, force an update
    if (conflicts.length === 0 && new Date(sourceIssue.updatedAt) > new Date(targetIssue.updatedAt)) {
      // Return an empty array but still trigger the update
      return [];
    }

    return conflicts;
  }

  private areLabelsEquivalent(labels1: NormalizedIssue['labels'], labels2: NormalizedIssue['labels']): boolean {
    const names1 = new Set(labels1.map(l => l.name.toLowerCase()));
    const names2 = new Set(labels2.map(l => l.name.toLowerCase()));
    return names1.size === names2.size && [...names1].every(name => names2.has(name));
  }

  private areAssigneesEquivalent(assignees1: string[], assignees2: string[]): boolean {
    const set1 = new Set(assignees1);
    const set2 = new Set(assignees2);
    return set1.size === set2.size && [...set1].every(a => set2.has(a));
  }
}
