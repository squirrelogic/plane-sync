import { GitHubService } from '../services/github';
import { PlaneService } from '../services/plane';
import { SyncOptions, SyncState, ProjectItem, Issue, IssueChange, IssueConflict, SyncResult } from '../types';
import { ConfigManager } from '../config';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Get the home directory and create .plane-sync if it doesn't exist
const homeDir = os.homedir();
const planeSyncDir = path.join(homeDir, '.plane-sync');
if (!fs.existsSync(planeSyncDir)) {
  fs.mkdirSync(planeSyncDir);
}

function compareIssues(issue1: Issue, issue2: Issue): string[] {
  const conflicts: string[] = [];
  const fields: (keyof Issue)[] = ['title', 'description', 'state', 'labels'];

  for (const field of fields) {
    if (field === 'labels') {
      // Compare labels as sets
      const labels1 = new Set(issue1[field]);
      const labels2 = new Set(issue2[field]);
      if (labels1.size !== labels2.size ||
          [...labels1].some(label => !labels2.has(label))) {
        conflicts.push(field);
      }
    } else if (issue1[field] !== issue2[field]) {
      conflicts.push(field);
    }
  }

  return conflicts;
}

async function identifyChangesAndConflicts(
  github: GitHubService,
  plane: PlaneService,
  state: SyncState
): Promise<SyncResult> {
  const result: SyncResult = {
    githubToPlaneChanges: [],
    planeToGithubChanges: [],
    conflicts: [],
    errors: []
  };

  try {
    // Get all issues from both systems
    const [githubIssues, planeIssues] = await Promise.all([
      github.getIssues(),
      plane.getIssues()
    ]);

    // Create maps for easier lookup
    const githubIssueMap = new Map(githubIssues.map(i => [i.id, i]));
    const planeIssueMap = new Map(planeIssues.map(i => [i.id, i]));
    const stateMap = state.issues || {};

    // Check each GitHub issue
    for (const githubIssue of githubIssues) {
      const stateEntry = Object.values(stateMap).find(i => i.githubId === githubIssue.id);

      if (!stateEntry) {
        // New issue in GitHub
        result.githubToPlaneChanges.push({
          source: 'github',
          issue: githubIssue
        });
        continue;
      }

      const planeIssue = planeIssueMap.get(stateEntry.planeId);
      if (!planeIssue) {
        // Plane issue was deleted, treat as new GitHub issue
        result.githubToPlaneChanges.push({
          source: 'github',
          issue: githubIssue
        });
        continue;
      }

      // Check if either or both have changed since last sync
      const githubChanged = githubIssue.hash !== stateEntry.lastHash;
      const planeChanged = planeIssue.hash !== stateEntry.lastHash;

      if (githubChanged && planeChanged) {
        // Both changed - check for conflicts
        const conflictingFields = compareIssues(githubIssue, planeIssue);
        if (conflictingFields.length > 0) {
          result.conflicts.push({
            githubIssue,
            planeIssue,
            lastSyncHash: stateEntry.lastHash,
            conflictingFields: conflictingFields.map(field => ({
              field,
              githubValue: githubIssue[field as keyof Issue],
              planeValue: planeIssue[field as keyof Issue]
            }))
          });
        } else {
          // Changes don't conflict - sync both ways
          result.githubToPlaneChanges.push({
            source: 'github',
            issue: githubIssue,
            lastSyncHash: stateEntry.lastHash
          });
          result.planeToGithubChanges.push({
            source: 'plane',
            issue: planeIssue,
            lastSyncHash: stateEntry.lastHash
          });
        }
      } else if (githubChanged) {
        result.githubToPlaneChanges.push({
          source: 'github',
          issue: githubIssue,
          lastSyncHash: stateEntry.lastHash
        });
      } else if (planeChanged) {
        result.planeToGithubChanges.push({
          source: 'plane',
          issue: planeIssue,
          lastSyncHash: stateEntry.lastHash
        });
      }
    }

    // Check for new Plane issues
    for (const planeIssue of planeIssues) {
      const stateEntry = Object.values(stateMap).find(i => i.planeId === planeIssue.id);
      if (!stateEntry) {
        // New issue in Plane
        result.planeToGithubChanges.push({
          source: 'plane',
          issue: planeIssue
        });
      }
    }

  } catch (error) {
    result.errors.push(error as Error);
  }

  return result;
}

export async function sync(options: SyncOptions): Promise<void> {
  // Load configuration
  const config = new ConfigManager(options.configPath).getConfig();

  // Generate state file name based on GitHub repo
  const repoName = config.github.repo;
  const stateFileName = `${repoName}-plane-sync-state.json`;
  const stateFilePath = path.join(planeSyncDir, stateFileName);

  if (!process.env.GITHUB_TOKEN || !process.env.PLANE_API_KEY) {
    console.error('Error: Missing required environment variables GITHUB_TOKEN or PLANE_API_KEY');
    process.exit(1);
  }

  const github = new GitHubService(
    process.env.GITHUB_TOKEN,
    config.github.owner,
    config.github.repo,
    config.github.projectNumber,
    config.github.isOrgProject
  );

  const plane = new PlaneService(
    process.env.PLANE_API_KEY,
    config.plane.baseUrl,
    config.plane.workspaceSlug,
    config.plane.projectSlug
  );

  const syncState = fs.existsSync(stateFilePath)
    ? JSON.parse(fs.readFileSync(stateFilePath, 'utf8'))
    : { lastSync: null, issues: {} };

  try {
    // First, handle GitHub project items
    await syncGitHubProjectItems(github, plane, syncState, config.sync.autoConvertBacklogItems);

    // Identify all changes and conflicts
    const syncResult = await identifyChangesAndConflicts(github, plane, syncState);

    if (syncResult.errors.length > 0) {
      console.error('Errors occurred during sync analysis:');
      syncResult.errors.forEach(error => console.error(error));
      process.exit(1);
    }

    // Process Plane to GitHub changes first
    console.log(`\nSyncing ${syncResult.planeToGithubChanges.length} changes from Plane to GitHub...`);
    for (const change of syncResult.planeToGithubChanges) {
      const stateEntry = Object.values(syncState.issues).find(
        (i): i is { githubId: string; planeId: string; lastHash: string } =>
          Boolean(i && typeof i === 'object' && 'planeId' in i && i.planeId === change.issue.id)
      );
      if (stateEntry) {
        await github.updateIssue(stateEntry.githubId, change.issue);
        stateEntry.lastHash = change.issue.hash || '';
        console.log(`Updated GitHub issue #${stateEntry.githubId}`);
      } else {
        const githubIssue = await github.createIssue(change.issue);
        await github.addIssueToProject(parseInt(githubIssue.id));
        syncState.issues[githubIssue.id] = {
          githubId: githubIssue.id,
          planeId: change.issue.id,
          lastHash: change.issue.hash || ''
        };
        console.log(`Created GitHub issue #${githubIssue.id}`);
      }
    }

    // Then process GitHub to Plane changes
    console.log(`\nSyncing ${syncResult.githubToPlaneChanges.length} changes from GitHub to Plane...`);
    for (const change of syncResult.githubToPlaneChanges) {
      const stateEntry = Object.values(syncState.issues).find(
        (i): i is { githubId: string; planeId: string; lastHash: string } =>
          Boolean(i && typeof i === 'object' && 'githubId' in i && i.githubId === change.issue.id)
      );
      if (stateEntry) {
        await plane.updateIssue(stateEntry.planeId, change.issue);
        stateEntry.lastHash = change.issue.hash || '';
        console.log(`Updated Plane issue for GitHub #${change.issue.id}`);
      } else {
        const planeIssue = await plane.createIssue(change.issue);
        syncState.issues[change.issue.id] = {
          githubId: change.issue.id,
          planeId: planeIssue.id,
          lastHash: change.issue.hash || ''
        };
        console.log(`Created Plane issue for GitHub #${change.issue.id}`);
      }
    }

    // Report conflicts
    if (syncResult.conflicts.length > 0) {
      console.log('\nConflicts detected:');
      for (const conflict of syncResult.conflicts) {
        console.log(`\nConflict between GitHub #${conflict.githubIssue.id} and Plane issue ${conflict.planeIssue.id}:`);
        for (const field of conflict.conflictingFields) {
          console.log(`  - ${field.field}:`);
          console.log(`    GitHub: ${field.githubValue}`);
          console.log(`    Plane:  ${field.planeValue}`);
        }
      }
      console.log('\nPlease resolve these conflicts manually and run sync again.');
    }

    // Update sync state
    syncState.lastSync = new Date().toISOString();
    fs.writeFileSync(stateFilePath, JSON.stringify(syncState, null, 2));

    console.log('\nSync completed successfully!');
  } catch (error) {
    console.error('Error during sync:', error);
    process.exit(1);
  }
}

async function syncGitHubProjectItems(
  github: GitHubService,
  plane: PlaneService,
  state: SyncState,
  autoConvert: boolean
): Promise<void> {
  const projectItems = await github.getProjectItems();

  // First, add any existing repo issues to the project if they're not already there
  const githubIssues = await github.getIssues();
  for (const issue of githubIssues) {
    const projectItem = projectItems.find(item => item.issueNumber === parseInt(issue.id));
    if (!projectItem) {
      // Issue exists but is not in the project, add it
      await github.addIssueToProject(parseInt(issue.id));
      console.log(`Added existing issue #${issue.id} to project`);
    }
  }

  // Now handle project items that need to be converted to issues
  for (const item of projectItems) {
    if (!item.convertedToIssue) {
      // Only convert if autoConvert is true or if the item is not in backlog
      if (autoConvert || item.status !== 'BACKLOG') {
        // Create a new issue and add it to the project
        const issueNumber = await github.createIssueOnly(item.title, item.body);
        await github.addIssueToProject(issueNumber);
        console.log(`Created issue #${issueNumber} for project item "${item.title}" and linked it to the project`);

        // Create corresponding Plane issue with appropriate state mapping
        const planeIssue = await plane.createIssue({
          title: item.title,
          description: item.body,
          state: item.status === 'DONE' ? 'closed' : 'open',
          labels: [],
          assignees: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Update state
        if (!state.issues) state.issues = {};
        state.issues[issueNumber.toString()] = {
          githubId: issueNumber.toString(),
          planeId: planeIssue.id,
          lastHash: planeIssue.hash!,
          isProjectItem: true
        };
      }
    }
  }
}
