#!/usr/bin/env node

import { Command } from 'commander';
import { sync } from './commands/sync.js';
import { status } from './commands/status.js';
import { assignees } from './commands/assignees.js';
import { ConfigManager } from './config.js';

const config = new ConfigManager();

const program = new Command();

program
  .name('plane-sync')
  .description('CLI tool to sync GitHub issues with Plane')
  .version('0.15.0');

program.addCommand(sync);
program.addCommand(status);
program.addCommand(assignees);

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
