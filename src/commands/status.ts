import fs from 'fs';
import path from 'path';
import os from 'os';
import { SyncState } from '../types';
import { ConfigManager } from '../config';

// Get the home directory and .plane-sync directory
const homeDir = os.homedir();
const planeSyncDir = path.join(homeDir, '.plane-sync');

export async function status(): Promise<void> {
  // Load configuration to get repo name
  const config = new ConfigManager().getConfig();
  const repoName = config.github.repo;
  const stateFileName = `${repoName}-plane-sync-state.json`;
  const stateFilePath = path.join(planeSyncDir, stateFileName);

  if (!fs.existsSync(stateFilePath)) {
    console.log('No sync state found. Run sync first to initialize.');
    return;
  }

  const state: SyncState = JSON.parse(fs.readFileSync(stateFilePath, 'utf8'));
  const issueCount = Object.keys(state.issues).length;

  console.log('\nSync Status:');
  console.log('-----------');
  console.log(`Last sync: ${state.lastSync || 'Never'}`);
  console.log(`Tracked issues: ${issueCount}`);
  console.log('\nIssue Mappings:');

  Object.entries(state.issues).forEach(([key, value]) => {
    console.log(`GitHub #${value.githubId} <-> Plane ${value.planeId}`);
  });
}
