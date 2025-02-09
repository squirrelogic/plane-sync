import { AssigneeService } from '../services/assignees';
import { ConfigManager } from '../config';
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
      }
    },
    {
      type: 'password',
      name: 'password',
      message: 'Enter your Plane password:',
      mask: '*',
      validate: (input: string) => {
        if (!input) return 'Password is required';
        return true;
      }
    }
  ]);

  return answers;
}

export async function syncAssignees(options: AssigneesOptions): Promise<void> {
  if (!process.env.GITHUB_TOKEN || !process.env.PLANE_API_KEY) {
    console.error('Error: Missing required environment variables GITHUB_TOKEN or PLANE_API_KEY');
    process.exit(1);
  }

  const config = new ConfigManager(options.configPath).getConfig();

  console.log('To fetch workspace members, we need your Plane credentials.');
  const credentials = await promptForCredentials();

  const assigneeService = new AssigneeService(
    process.env.GITHUB_TOKEN,
    process.env.PLANE_API_KEY,
    config.plane.baseUrl,
    config.github.owner,
    config.plane.workspaceSlug,
    credentials.email,
    credentials.password,
    config.plane.projectSlug
  );

  console.log('\nSyncing assignees...');

  try {
    const result = await assigneeService.syncAssignees(config);

    // Update config with new mappings and user lists
    config.assignees = {
      mappings: result.mappings,
      lastSyncedAt: new Date().toISOString(),
      github_users: result.github_users,
      plane_users: result.plane_users
    };

    new ConfigManager(options.configPath).updateConfig(config);

    console.log('\nAssignee mappings updated successfully!');
    console.log(`\nMapped ${result.mappings.length} users:`);
    for (const mapping of result.mappings) {
      console.log(`- ${mapping.name} (${mapping.githubUsername} -> ${mapping.planeUserId})`);
    }

    if (result.unmappedGitHub.length > 0) {
      console.log('\nUnmapped GitHub users:');
      for (const username of result.unmappedGitHub) {
        console.log(`- ${username}`);
      }
    }

    if (result.unmappedPlane.length > 0) {
      console.log('\nUnmapped Plane users:');
      for (const user of result.unmappedPlane) {
        console.log(`- ${user}`);
      }
    }
  } catch (error) {
    console.error('Error syncing assignees:', error);
    process.exit(1);
  }
}
