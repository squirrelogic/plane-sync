import fs from 'fs';
import path from 'path';
import { SyncConfig } from './types';

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), '.plane-sync.json');

export class ConfigManager {
  private config: SyncConfig;

  constructor(configPath?: string) {
    const configFile = configPath || DEFAULT_CONFIG_PATH;

    if (!fs.existsSync(configFile)) {
      throw new Error(`Configuration file not found at ${configFile}. Please create one or specify a different path.`);
    }

    try {
      this.config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
      this.validateConfig();
    } catch (error) {
      throw new Error(`Failed to load configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private validateConfig(): void {
    const required: { [key: string]: string[] } = {
      github: ['owner', 'repo', 'projectNumber'],
      plane: ['baseUrl', 'workspaceSlug', 'projectSlug'],
      sync: ['direction', 'autoConvertBacklogItems']
    };

    for (const [section, fields] of Object.entries(required)) {
      if (!this.config[section as keyof SyncConfig]) {
        throw new Error(`Missing required section: ${section}`);
      }

      for (const field of fields) {
        const value = (this.config[section as keyof SyncConfig] as any)[field];
        if (value === undefined || value === null) {
          throw new Error(`Missing required field: ${section}.${field}`);
        }
      }
    }
  }

  public getConfig(): SyncConfig {
    return this.config;
  }

  public static createDefaultConfig(outputPath?: string): void {
    const defaultConfig: SyncConfig = {
      github: {
        owner: "your-github-username",
        repo: "your-repo-name",
        projectNumber: 1,
        isOrgProject: false
      },
      plane: {
        baseUrl: "https://your-plane-instance.com",
        workspaceSlug: "your-workspace",
        projectSlug: "your-project"
      },
      sync: {
        direction: "both",
        autoConvertBacklogItems: false
      }
    };

    const configPath = outputPath || DEFAULT_CONFIG_PATH;
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created default configuration at ${configPath}`);
  }
}
