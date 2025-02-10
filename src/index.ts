#!/usr/bin/env node
import { Command } from 'commander';
import { sync } from './commands/sync.js';
import { status } from './commands/status.js';
import { assignees } from './commands/assignees.js';
import pkg from '../package.json' assert { type: 'json' };

const program = new Command();

program
  .name('plane-sync')
  .description('CLI tool to sync GitHub issues with Plane')
  .version(pkg.version);

program.addCommand(sync);
program.addCommand(status);
program.addCommand(assignees);

program.parse();
