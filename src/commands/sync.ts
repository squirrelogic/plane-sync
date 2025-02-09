import { GitHubService } from '../services/github';
import { PlaneService } from '../services/plane';
import { SyncOptions, SyncState, ProjectItem, Issue, IssueChange, IssueConflict, SyncResult, SyncConfig, AssigneeMapping } from '../types';
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
    } else if (field === 'state') {
      // Compare state names instead of the entire state object
      if (issue1[field].name.toLowerCase() !== issue2[field].name.toLowerCase()) {
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
  state: SyncState,
  config: SyncConfig
): Promise<SyncResult> {
  const result: SyncResult = {
    githubToPlaneChanges: [],
    planeToGithubChanges: [],
    conflicts: [],
    errors: []
  };

  try {
    // Get all issues from both systems first
    const [githubIssues, planeIssues] = await Promise.all([
      github.getIssues(),
      plane.getIssues()
    ]);

    // Check if assignee mappings exist and set up mapping if they do
    let shouldMapAssignees = false;
    let githubToPlaneMap = new Map<string, string>();
    let planeToGithubMap = new Map<string, string>();

    if (config.assignees?.mappings && config.assignees.mappings.length > 0) {
      shouldMapAssignees = true;
      const assigneeMappings = config.assignees.mappings;
      githubToPlaneMap = new Map(assigneeMappings.map((m: AssigneeMapping) => [m.githubUsername, m.planeUserId]));
      planeToGithubMap = new Map(assigneeMappings.map((m: AssigneeMapping) => [m.planeUserId, m.githubUsername]));
    } else {
      console.warn('Warning: No assignee mappings found. Run "plane-sync assignees" first to set up assignee mappings.');
      console.warn('Proceeding with sync but assignees will not be synchronized...');
    }

    // Map assignees in GitHub issues, preserving original assignees if no mapping exists
    const mappedGithubIssues = githubIssues.map(issue => {
      if (!shouldMapAssignees) {
        return issue; // Preserve original assignees if no mappings exist
      }
      return {
        ...issue,
        assignees: issue.assignees
          .map(username => githubToPlaneMap.get(username))
          .filter((id): id is string => id !== undefined)
      };
    });

    // Map assignees in Plane issues, preserving original assignees if no mapping exists
    const mappedPlaneIssues = planeIssues.map(issue => {
      if (!shouldMapAssignees) {
        return issue; // Preserve original assignees if no mappings exist
      }
      return {
        ...issue,
        assignees: issue.assignees
          .map(id => planeToGithubMap.get(id))
          .filter((username): username is string => username !== undefined)
      };
    });

    // Create maps for easier lookup
    const githubIssueMap = new Map(mappedGithubIssues.map(i => [i.id, i]));
    const planeIssueMap = new Map(mappedPlaneIssues.map(i => [i.id, i]));
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

interface SyncPlanItem {
  githubIssue: string;
  planeIssue: string;
  action: string;
  direction: string;
  reason: string;
  currentHash?: string;
  lastSyncHash?: string;
  fieldChanges?: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
}

async function generateSyncPlan(
  syncResult: SyncResult,
  github: GitHubService,
  plane: PlaneService,
  state: SyncState
): Promise<SyncPlanItem[]> {
  const plan: SyncPlanItem[] = [];

  // Process GitHub to Plane changes
  for (const change of syncResult.githubToPlaneChanges) {
    const stateEntry = Object.values(state.issues).find(i => i.githubId === change.issue.id);
    if (stateEntry) {
      const planeIssue = await plane.getIssue(stateEntry.planeId);
      const fieldChanges = compareIssuesDetailed(change.issue, planeIssue);
      plan.push({
        githubIssue: `#${change.issue.id}`,
        planeIssue: stateEntry.planeId,
        action: 'Update',
        direction: 'GitHub → Plane',
        reason: 'GitHub issue modified since last sync',
        currentHash: change.issue.hash,
        lastSyncHash: stateEntry.lastHash,
        fieldChanges
      });
    } else {
      plan.push({
        githubIssue: `#${change.issue.id}`,
        planeIssue: 'New',
        action: 'Create',
        direction: 'GitHub → Plane',
        reason: 'New issue in GitHub',
        currentHash: change.issue.hash
      });
    }
  }

  // Process Plane to GitHub changes
  for (const change of syncResult.planeToGithubChanges) {
    const stateEntry = Object.values(state.issues).find(i => i.planeId === change.issue.id);
    if (stateEntry) {
      const githubIssue = await github.getIssue(stateEntry.githubId);
      const fieldChanges = compareIssuesDetailed(githubIssue, change.issue);
      plan.push({
        githubIssue: `#${stateEntry.githubId}`,
        planeIssue: change.issue.id,
        action: 'Update',
        direction: 'Plane → GitHub',
        reason: 'Plane issue modified since last sync',
        currentHash: change.issue.hash,
        lastSyncHash: stateEntry.lastHash,
        fieldChanges
      });
    } else {
      plan.push({
        githubIssue: 'New',
        planeIssue: change.issue.id,
        action: 'Create',
        direction: 'Plane → GitHub',
        reason: 'New issue in Plane',
        currentHash: change.issue.hash
      });
    }
  }

  // Add conflicts to the plan
  for (const conflict of syncResult.conflicts) {
    plan.push({
      githubIssue: `#${conflict.githubIssue.id}`,
      planeIssue: conflict.planeIssue.id,
      action: 'Conflict',
      direction: '⚠️',
      reason: `Conflicting changes in: ${conflict.conflictingFields.map(f => f.field).join(', ')}`,
      currentHash: conflict.githubIssue.hash,
      lastSyncHash: conflict.lastSyncHash,
      fieldChanges: conflict.conflictingFields.map(f => ({
        field: f.field,
        oldValue: f.githubValue,
        newValue: f.planeValue
      }))
    });
  }

  return plan;
}

function compareIssuesDetailed(issue1: Issue, issue2: Issue): { field: string; oldValue: any; newValue: any; }[] {
  const changes: { field: string; oldValue: any; newValue: any; }[] = [];
  const fields: (keyof Issue)[] = ['title', 'description', 'state', 'labels'];

  for (const field of fields) {
    if (field === 'labels') {
      const labels1 = new Set(issue1[field]);
      const labels2 = new Set(issue2[field]);
      if (labels1.size !== labels2.size || [...labels1].some(label => !labels2.has(label))) {
        changes.push({
          field,
          oldValue: [...labels1],
          newValue: [...labels2]
        });
      }
    } else if (field === 'state') {
      if (issue1[field].name.toLowerCase() !== issue2[field].name.toLowerCase()) {
        changes.push({
          field,
          oldValue: issue1[field].name,
          newValue: issue2[field].name
        });
      }
    } else if (issue1[field] !== issue2[field]) {
      changes.push({
        field,
        oldValue: issue1[field],
        newValue: issue2[field]
      });
    }
  }

  return changes;
}

function displaySyncPlan(plan: SyncPlanItem[]): void {
  if (plan.length === 0) {
    console.log('\nNo changes to sync.');
    return;
  }

  console.log('\nSync Plan:');

  for (const item of plan) {
    console.log('\n' + '─'.repeat(120));
    console.log(`Action:       ${item.action}`);
    console.log(`Direction:    ${item.direction}`);
    console.log(`GitHub Issue: ${item.githubIssue}`);
    console.log(`Plane Issue:  ${item.planeIssue}`);
    console.log(`Reason:       ${item.reason}`);

    if (item.currentHash) {
      console.log(`Current Hash: ${item.currentHash.substring(0, 8)}...`);
    }
    if (item.lastSyncHash) {
      console.log(`Last Sync:    ${item.lastSyncHash.substring(0, 8)}...`);
    }

    if (item.fieldChanges && item.fieldChanges.length > 0) {
      console.log('\nField Changes:');
      for (const change of item.fieldChanges) {
        console.log(`  ${change.field}:`);
        if (item.direction === 'GitHub → Plane') {
          if (Array.isArray(change.oldValue)) {
            console.log(`    GitHub (source): [${change.oldValue.join(', ')}]`);
            console.log(`    Plane (target):  [${change.newValue.join(', ')}]`);
          } else if (change.field === 'state') {
            console.log(`    GitHub (source): ${JSON.stringify(change.oldValue)}`);
            console.log(`    Plane (target):  ${JSON.stringify(change.newValue)}`);
          } else {
            console.log(`    GitHub (source): ${change.oldValue}`);
            console.log(`    Plane (target):  ${change.newValue}`);
          }
        } else if (item.direction === 'Plane → GitHub') {
          if (Array.isArray(change.oldValue)) {
            console.log(`    Plane (source):  [${change.oldValue.join(', ')}]`);
            console.log(`    GitHub (target): [${change.newValue.join(', ')}]`);
          } else if (change.field === 'state') {
            console.log(`    Plane (source):  ${JSON.stringify(change.oldValue)}`);
            console.log(`    GitHub (target): ${JSON.stringify(change.newValue)}`);
          } else {
            console.log(`    Plane (source):  ${change.oldValue}`);
            console.log(`    GitHub (target): ${change.newValue}`);
          }
        } else {
          // For conflicts
          if (Array.isArray(change.oldValue)) {
            console.log(`    GitHub: [${change.oldValue.join(', ')}]`);
            console.log(`    Plane:  [${change.newValue.join(', ')}]`);
          } else if (change.field === 'state') {
            console.log(`    GitHub: ${JSON.stringify(change.oldValue)}`);
            console.log(`    Plane:  ${JSON.stringify(change.newValue)}`);
          } else {
            console.log(`    GitHub: ${change.oldValue}`);
            console.log(`    Plane:  ${change.newValue}`);
          }
        }
      }
    }
  }
  console.log('\n' + '─'.repeat(120));
}

async function promptToProceed(): Promise<boolean> {
  return new Promise(resolve => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\nDo you want to proceed with the sync? (y/N) ', (answer: string) => {
      readline.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function displaySideBySideComparison(
  githubIssue: Issue,
  planeIssue: Issue | null,
  direction: string,
  lastSyncHash?: string
): Promise<void> {
  const terminalWidth = process.stdout.columns || 120;
  const halfWidth = Math.floor(terminalWidth / 2) - 2;

  console.log('\n' + '═'.repeat(terminalWidth));

  // Header
  const header = `GitHub Issue #${githubIssue.id}${direction}${planeIssue ? `Plane Issue ${planeIssue.id}` : 'New Plane Issue'}`;
  console.log(header.padStart(Math.floor((terminalWidth + header.length) / 2)));

  console.log('═'.repeat(terminalWidth));

  // Previous sync hash if available
  if (lastSyncHash) {
    console.log(`Last Sync Hash: ${lastSyncHash}`);
    console.log('─'.repeat(terminalWidth));
  }

  // Current hashes
  const githubHashLine = `Current Hash: ${githubIssue.hash?.substring(0, 8) || 'N/A'}`;
  const planeHashLine = planeIssue ? `Current Hash: ${planeIssue.hash?.substring(0, 8) || 'N/A'}` : 'N/A';
  console.log(githubHashLine.padEnd(halfWidth) + '│' + planeHashLine.padStart(halfWidth));

  console.log('─'.repeat(terminalWidth));

  // Title
  console.log('TITLE'.padEnd(terminalWidth));
  console.log(githubIssue.title.padEnd(halfWidth) + '│' + (planeIssue?.title || '').padStart(halfWidth));

  console.log('─'.repeat(terminalWidth));

  // State
  console.log('STATE'.padEnd(terminalWidth));
  console.log(githubIssue.state.name.padEnd(halfWidth) + '│' + (planeIssue?.state.name || '').padStart(halfWidth));

  console.log('─'.repeat(terminalWidth));

  // Description
  console.log('DESCRIPTION'.padEnd(terminalWidth));
  const githubDesc = githubIssue.description || '';
  const planeDesc = planeIssue?.description || '';
  const githubLines = githubDesc.split('\n');
  const planeLines = planeDesc.split('\n');
  const maxLines = Math.max(githubLines.length, planeLines.length);

  for (let i = 0; i < maxLines; i++) {
    const githubLine = (githubLines[i] || '').padEnd(halfWidth);
    const planeLine = (planeLines[i] || '').padStart(halfWidth);
    console.log(githubLine + '│' + planeLine);
  }

  console.log('─'.repeat(terminalWidth));

  // Labels
  console.log('LABELS'.padEnd(terminalWidth));
  console.log(
    JSON.stringify(githubIssue.labels).padEnd(halfWidth) + '│' +
    JSON.stringify(planeIssue?.labels || []).padStart(halfWidth)
  );

  console.log('─'.repeat(terminalWidth));

  // Assignees
  console.log('ASSIGNEES'.padEnd(terminalWidth));
  console.log(
    JSON.stringify(githubIssue.assignees).padEnd(halfWidth) + '│' +
    JSON.stringify(planeIssue?.assignees || []).padStart(halfWidth)
  );

  console.log('═'.repeat(terminalWidth));
}

async function promptToSyncIssue(): Promise<boolean> {
  return new Promise(resolve => {
    const readline = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });

    readline.question('\nSync this issue? (y/N/q to quit) ', (answer: string) => {
      readline.close();
      if (answer.toLowerCase() === 'q') {
        console.log('\nSync cancelled. Exiting...');
        process.exit(0);
      }
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

export async function sync(options: SyncOptions): Promise<void> {
  // Load configuration
  const config = new ConfigManager(options.configPath).getConfig();

  // Override direction if specified in options
  if (options.direction) {
    config.sync.direction = options.direction;
  }

  // Check for assignee mappings right at the start
  if (!config.assignees?.mappings || config.assignees.mappings.length === 0) {
    console.error('\nError: No assignee mappings found.');
    console.error('Please run "plane-sync assignees" first to set up assignee mappings between GitHub and Plane users.');
    console.error('This is required to ensure proper synchronization of issue assignments.');
    process.exit(1);
  }

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
    config.plane.projectSlug,
    config.assignees?.mappings
  );

  const syncState = fs.existsSync(stateFilePath)
    ? JSON.parse(fs.readFileSync(stateFilePath, 'utf8'))
    : { lastSync: null, issues: {} };

  try {
    // First, handle GitHub project items
    await syncGitHubProjectItems(github, plane, syncState, config.sync.autoConvertBacklogItems);

    // Identify all changes and conflicts
    const syncResult = await identifyChangesAndConflicts(github, plane, syncState, config);

    if (syncResult.errors.length > 0) {
      console.error('Errors occurred during sync analysis:');
      syncResult.errors.forEach(error => console.error(error));
      process.exit(1);
    }

    // If there are no changes, exit early
    if (syncResult.githubToPlaneChanges.length === 0 &&
        syncResult.planeToGithubChanges.length === 0 &&
        syncResult.conflicts.length === 0) {
      console.log('\nNo changes to sync. Exiting...');
      return;
    }

    // Process changes based on sync direction
    if (config.sync.direction === 'plane-to-github' || config.sync.direction === 'both') {
      // Process Plane to GitHub changes
      console.log(`\nProcessing ${syncResult.planeToGithubChanges.length} changes from Plane to GitHub...`);
      for (const change of syncResult.planeToGithubChanges) {
        const stateEntry = Object.values(syncState.issues).find(
          (i): i is { githubId: string; planeId: string; lastHash: string } =>
            Boolean(i && typeof i === 'object' && 'planeId' in i && i.planeId === change.issue.id)
        );

        if (stateEntry) {
          // Show side by side comparison for existing issue
          const githubIssue = await github.getIssue(stateEntry.githubId);
          await displaySideBySideComparison(githubIssue, change.issue, ' ← ', stateEntry.lastHash);
        } else {
          // Show side by side comparison for new issue
          const dummyGithubIssue: Issue = {
            id: 'NEW',
            title: '',
            description: '',
            state: { id: '', name: '' },
            labels: [],
            assignees: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          await displaySideBySideComparison(dummyGithubIssue, change.issue, ' ← ');
        }

        const shouldSync = await promptToSyncIssue();
        if (!shouldSync) {
          console.log('Skipping this issue...');
          continue;
        }

        // ... rest of the Plane to GitHub sync logic ...
      }
    }

    if (config.sync.direction === 'github-to-plane' || config.sync.direction === 'both') {
      // Process GitHub to Plane changes
      console.log(`\nProcessing ${syncResult.githubToPlaneChanges.length} changes from GitHub to Plane...`);
      for (const change of syncResult.githubToPlaneChanges) {
        const stateEntry = Object.values(syncState.issues).find(
          (i): i is { githubId: string; planeId: string; lastHash: string } =>
            Boolean(i && typeof i === 'object' && 'githubId' in i && i.githubId === change.issue.id)
        );

        if (stateEntry) {
          // Show side by side comparison for existing issue
          const planeIssue = await plane.getIssue(stateEntry.planeId);
          await displaySideBySideComparison(change.issue, planeIssue, ' → ', stateEntry.lastHash);
        } else {
          // Show side by side comparison for new issue
          await displaySideBySideComparison(change.issue, null, ' → ');
        }

        const shouldSync = await promptToSyncIssue();
        if (!shouldSync) {
          console.log('Skipping this issue...');
          continue;
        }

        // ... rest of the GitHub to Plane sync logic ...
      }
    }

    // Show conflicts one at a time
    if (syncResult.conflicts.length > 0) {
      console.log(`\nProcessing ${syncResult.conflicts.length} conflicts...`);
      for (const conflict of syncResult.conflicts) {
        await displaySideBySideComparison(
          conflict.githubIssue,
          conflict.planeIssue,
          ' ⚠️ ',
          conflict.lastSyncHash
        );
        console.log('\nThis issue has conflicts. Please resolve manually and run sync again.');
        await promptToSyncIssue(); // Just to pause and wait for acknowledgment
      }
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
          state: {
            id: '',
            name: item.status === 'DONE' ? 'closed' : 'open'
          },
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

async function findMatchingGitHubIssue(github: GitHubService, planeIssue: Issue): Promise<Issue | null> {
  // Get all GitHub issues
  const githubIssues = await github.getIssues();

  // Look for an issue with matching title and description
  return githubIssues.find(issue =>
    issue.title === planeIssue.title &&
    issue.description === planeIssue.description
  ) || null;
}
