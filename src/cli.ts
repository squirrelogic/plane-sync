#!/usr/bin/env node

import { Command } from 'commander';
import { sync } from './commands/sync';
import { status } from './commands/status';
import { syncAssignees } from './commands/assignees';
import { ConfigManager } from './config';

const program = new Command();

program
  .name('plane-sync')
  .description('Synchronize issues between Plane and GitHub')
  .version('0.1.0');

program
  .command('sync')
  .description('Synchronize issues between Plane and GitHub')
  .option('-c, --config <path>', 'Path to config file')
  .action((options) => {
    sync(options).catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
  });

program
  .command('status')
  .description('Show sync status')
  .action(() => {
    status().catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
  });

program
  .command('assignees')
  .description('Synchronize assignee mappings between Plane and GitHub')
  .option('-c, --config <path>', 'Path to config file')
  .action((options) => {
    syncAssignees(options).catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
  });

program
  .command('init')
  .description('Create a default configuration file')
  .option('-o, --output <path>', 'Output path for the config file')
  .action((options) => {
    try {
      ConfigManager.createDefaultConfig(options.output);
      console.log('Configuration file created successfully!');
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  });

program.parse();
