import { Command } from 'commander';
import { AssigneeService } from '../services/assignees.js';
import { ConfigManager } from '../config.js';
import inquirer from 'inquirer';

interface AssigneesOptions {
  configPath?: string;
}

async function promptForCredentials(): Promise<{ email: string; password: string }> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'email',
      message: 'Enter your Plane email:',
      validate: (input: string) => {
        if (!input) return 'Email is required';
        if (!input.includes('@')) return 'Please enter a valid email';
        return true;
      },
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter your Plane password:',
      mask: '*',
      validate: (input: string) => {
        if (!input) return 'Password is required';
        return true;
      },
    },
  ]);

  return answers;
}

export const assignees = new Command()
  .name('assignees')
  .description('Sync GitHub organization members with Plane workspace members')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    const config = new ConfigManager(options.configPath);
    const assigneeService = new AssigneeService(config);

    try {
      const result = await assigneeService.syncAssignees();

      if (result.mappings.length > 0) {
        console.log(`\nMapped ${result.mappings.length} users:`);
        for (const mapping of result.mappings) {
          console.log(`- GitHub: ${mapping.githubUsername} -> Plane: ${mapping.planeUserId}`);
        }
      }

      if (result.unmappedGitHub.length > 0) {
        console.log('\nUnmapped GitHub users:');
        for (const username of result.unmappedGitHub) {
          console.log(`- ${username}`);
        }
      }

      if (result.unmappedPlane.length > 0) {
        console.log('\nUnmapped Plane users:');
        for (const userId of result.unmappedPlane) {
          console.log(`- ${userId}`);
        }
      }

      // Save the mappings to config
      const currentConfig = config.getConfig();
      config.updateConfig({
        ...currentConfig,
        assignees: {
          mappings: result.mappings,
        },
      });

      console.log('\nAssignee mappings have been saved to config.');
    } catch (error) {
      console.error('Error syncing assignees:', error);
      process.exit(1);
    }
  });

export async function syncAssigneesManually(options: AssigneesOptions): Promise<void> {
  if (!process.env.GITHUB_TOKEN || !process.env.PLANE_API_KEY) {
    console.error('Error: Missing required environment variables GITHUB_TOKEN or PLANE_API_KEY');
    process.exit(1);
  }

  const configManager = new ConfigManager(options.configPath);
  const config = configManager.getConfig();

  console.log('To fetch workspace members, we need your Plane credentials.');
  const credentials = await promptForCredentials();

  process.env.PLANE_EMAIL = credentials.email;
  process.env.PLANE_PASSWORD = credentials.password;

  const assigneeService = new AssigneeService(configManager);

  console.log('\nSyncing assignees...');

  try {
    const result = await assigneeService.syncAssignees();

    // Update config with new mappings and user lists
    configManager.updateConfig({
      ...config,
      assignees: {
        mappings: result.mappings,
      },
    });

    console.log('\nAssignee mappings updated successfully!');
    console.log(`\nMapped ${result.mappings.length} users:`);
    for (const mapping of result.mappings) {
      console.log(`- ${mapping.githubUsername} -> ${mapping.planeUserId}`);
    }

    if (result.unmappedGitHub.length > 0) {
      console.log('\nUnmapped GitHub users:');
      for (const username of result.unmappedGitHub) {
        console.log(`- ${username}`);
      }
    }

    if (result.unmappedPlane.length > 0) {
      console.log('\nUnmapped Plane users:');
      for (const userId of result.unmappedPlane) {
        console.log(`- ${userId}`);
      }
    }
  } catch (error) {
    console.error('Error syncing assignees:', error);
    process.exit(1);
  }
}
