import { Command } from 'commander';
import { SyncState } from '../types/index.js';
import { ConfigManager } from '../config.js';

export const status = new Command()
  .name('status')
  .description('Show sync status')
  .action(async () => {
    const config = new ConfigManager();
    const syncState = config.getSyncState();

    if (!syncState || !syncState.lastSync) {
      console.log('No sync state found. Run sync first.');
      return;
    }

    console.log('\nLast sync:', new Date(syncState.lastSync).toLocaleString());
    console.log('\nSynced Issues:');
    console.log('--------------');

    Object.entries(syncState.issues).forEach(
      ([key, value]: [string, { sourceId: string; targetId: string }]) => {
        console.log(`GitHub #${value.sourceId} <-> Plane ${value.targetId}`);
      }
    );
  });
