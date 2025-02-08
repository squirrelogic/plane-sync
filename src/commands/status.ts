import fs from 'fs';
import path from 'path';
import { SyncState } from '../types';

const STATE_FILE = path.join(process.cwd(), '.plane-sync-state.json');

export async function status(): Promise<void> {
  if (!fs.existsSync(STATE_FILE)) {
    console.log('No sync state found. Run sync first to initialize.');
    return;
  }

  const state: SyncState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
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
