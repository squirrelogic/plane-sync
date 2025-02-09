import fs from 'fs';
import path from 'path';
import { SyncConfig } from './types';

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), '.plane-sync.json');

export class ConfigManager {
  private configPath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || DEFAULT_CONFIG_PATH;
  }

  public getConfig(): SyncConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Config file not found at ${this.configPath}`);
    }

    try {
      const config = JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      return config;
    } catch (error) {
      throw new Error(`Failed to parse config file: ${error}`);
    }
  }

  public updateConfig(config: SyncConfig): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Failed to update config file: ${error}`);
    }
  }

  private validateConfig(): void {
    const required: { [key: string]: string[] } = {
      github: ['owner', 'repo', 'projectNumber'],
      plane: ['baseUrl', 'workspaceSlug', 'projectSlug'],
      sync: ['direction', 'autoConvertBacklogItems']
    };

    for (const [section, fields] of Object.entries(required)) {
      if (!this.getConfig()[section as keyof SyncConfig]) {
        throw new Error(`Missing required section: ${section}`);
      }

      for (const field of fields) {
        const value = (this.getConfig()[section as keyof SyncConfig] as any)[field];
        if (value === undefined || value === null) {
          throw new Error(`Missing required field: ${section}.${field}`);
        }
      }
    }
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
