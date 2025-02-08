#!/usr/bin/env node

import { Command } from 'commander';
import dotenv from 'dotenv';
import { sync } from './commands/sync';
import { status } from './commands/status';
import { ConfigManager } from './config';

dotenv.config();

const program = new Command();

program
  .name('plane-sync')
  .description('CLI tool to sync GitHub issues with Plane')
  .version('0.1.0');

program
  .command('init')
  .description('Create a default configuration file')
  .option('-p, --path <path>', 'Path to create the configuration file')
  .action((options) => {
    ConfigManager.createDefaultConfig(options.path);
  });

program
  .command('sync')
  .description('Synchronize issues between GitHub and Plane')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('--github-repo <owner/repo>', 'GitHub repository in owner/repo format (overrides config)')
  .option('--plane-project <project-slug>', 'Plane project slug (overrides config)')
  .option('--direction <direction>', 'Sync direction: github-to-plane, plane-to-github, or both (overrides config)')
  .action(sync);

program
  .command('status')
  .description('Show sync status and last sync time')
  .action(status);

program.parse();
