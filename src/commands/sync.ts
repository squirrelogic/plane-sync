import { Command } from 'commander';
import { ConfigManager } from '../config.js';
import { SyncService } from '../services/sync-service.js';
import { GitHubProvider } from '../providers/github-provider.js';
import { PlaneProvider } from '../providers/plane-provider.js';
import { GitHubClient } from '../clients/github-client.js';
import { PlaneClient } from '../clients/plane-client.js';
import { IssueChange, IssueConflict } from '../types/index.js';

export const sync = new Command()
  .name('sync')
  .description('Sync issues between GitHub and Plane')
  .action(async () => {
    const config = new ConfigManager();
    const syncConfig = config.getConfig();

    if (!process.env.GITHUB_TOKEN || !process.env.PLANE_API_KEY) {
      console.error('Error: Missing required environment variables GITHUB_TOKEN or PLANE_API_KEY');
      process.exit(1);
    }

    const githubClient = new GitHubClient(process.env.GITHUB_TOKEN);
    const planeClient = new PlaneClient(syncConfig.plane.baseUrl, process.env.PLANE_API_KEY);

    const githubProvider = new GitHubProvider(
      githubClient,
      syncConfig.github.owner,
      syncConfig.github.repo,
      syncConfig.github.projectNumber,
      syncConfig.github.isOrgProject
    );

    const planeProvider = new PlaneProvider(
      planeClient,
      syncConfig.plane.workspaceSlug,
      syncConfig.plane.projectSlug
    );

    const syncService = new SyncService(githubProvider, planeProvider);
    const result = await syncService.sync();

    console.log('Changes to sync from GitHub to Plane:');
    result.sourceToTargetChanges.forEach((change: IssueChange) => {
      console.log(`- ${change.issue.title}`);
    });

    console.log('\nChanges to sync from Plane to GitHub:');
    result.targetToSourceChanges.forEach((change: IssueChange) => {
      console.log(`- ${change.issue.title}`);
    });

    if (result.conflicts.length > 0) {
      console.log('\nConflicts found:');
      result.conflicts.forEach((conflict: IssueConflict) => {
        console.log(`- ${conflict.sourceIssue.title}`);
        conflict.conflictingFields.forEach((field) => {
          console.log(
            `  ${field.field}: source="${field.sourceValue}" target="${field.targetValue}"`
          );
        });
      });
    }

    if (result.errors.length > 0) {
      console.log('\nErrors encountered:');
      result.errors.forEach((error) => console.log(`- ${error}`));
    }
  });
