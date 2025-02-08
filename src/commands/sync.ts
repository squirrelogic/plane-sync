import { GitHubService } from '../services/github';
import { PlaneService } from '../services/plane';
import { SyncOptions, SyncState, ProjectItem } from '../types';
import { ConfigManager } from '../config';
import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(process.cwd(), '.plane-sync-state.json');

export async function sync(options: SyncOptions): Promise<void> {
  // Load configuration
  const config = new ConfigManager(options.configPath).getConfig();

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

  // Load existing state
  let state: SyncState = { lastSync: '', issues: {} };
  if (fs.existsSync(STATE_FILE)) {
    state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }

  try {
    // First, handle GitHub project items
    await syncGitHubProjectItems(github, plane, state, config.sync.autoConvertBacklogItems);

    // Then handle regular issue sync
    if (config.sync.direction === 'github-to-plane' || config.sync.direction === 'both') {
      await syncGitHubToPlane(github, plane, state);
    }

    if (config.sync.direction === 'plane-to-github' || config.sync.direction === 'both') {
      await syncPlaneToGitHub(plane, github, state);
    }

    // Update sync state
    state.lastSync = new Date().toISOString();
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));

    console.log('Sync completed successfully!');
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

  for (const item of projectItems) {
    if (!item.convertedToIssue) {
      if (autoConvert && item.status !== 'BACKLOG') {
        // Auto-convert non-backlog items to issues
        const issueNumber = await github.convertToIssue(item.id, item.title, item.body);
        console.log(`Converted project item "${item.title}" to issue #${issueNumber}`);

        // Create corresponding Plane issue
        const planeIssue = await plane.createIssue({
          title: item.title,
          description: item.body,
          state: 'READY',
          labels: [],
          assignees: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });

        // Update state
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

async function syncGitHubToPlane(
  github: GitHubService,
  plane: PlaneService,
  state: SyncState
): Promise<void> {
  const githubIssues = await github.getIssues();

  for (const issue of githubIssues) {
    const stateEntry = Object.values(state.issues).find(i => i.githubId === issue.id);

    if (!stateEntry) {
      // New issue - create in Plane
      const planeIssue = await plane.createIssue(issue);
      state.issues[issue.id] = {
        githubId: issue.id,
        planeId: planeIssue.id,
        lastHash: issue.hash!
      };
      console.log(`Created Plane issue for GitHub #${issue.id}`);
    } else if (issue.hash !== stateEntry.lastHash) {
      // Updated issue - sync changes to Plane
      await plane.updateIssue(stateEntry.planeId, issue);
      stateEntry.lastHash = issue.hash!;
      console.log(`Updated Plane issue for GitHub #${issue.id}`);
    }
  }
}

async function syncPlaneToGitHub(
  plane: PlaneService,
  github: GitHubService,
  state: SyncState
): Promise<void> {
  const planeIssues = await plane.getIssues();

  for (const issue of planeIssues) {
    const stateEntry = Object.values(state.issues).find(i => i.planeId === issue.id);

    if (stateEntry && issue.hash !== stateEntry.lastHash) {
      // Updated issue - sync changes to GitHub
      await github.updateIssue(stateEntry.githubId, issue);
      stateEntry.lastHash = issue.hash!;
      console.log(`Updated GitHub issue #${stateEntry.githubId}`);
    }
  }
}
