import fs from 'fs';
import path from 'path';
import { SyncConfig, SyncState } from './types/index.js';

const DEFAULT_CONFIG_PATH = path.join(process.cwd(), '.plane-sync.json');

export class ConfigManager {
  private configPath: string;
  private syncStatePath: string;

  constructor(configPath?: string) {
    this.configPath = configPath || DEFAULT_CONFIG_PATH;
    this.syncStatePath = path.join(process.cwd(), '.plane-sync-state.json');
  }

  public getConfig(): SyncConfig {
    if (!fs.existsSync(this.configPath)) {
      throw new Error(`Config file not found at ${this.configPath}`);
    }

    try {
      const configData = fs.readFileSync(this.configPath, 'utf8');
      return JSON.parse(configData);
    } catch (error) {
      throw new Error(`Error reading config file: ${error}`);
    }
  }

  public updateConfig(config: SyncConfig): void {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
    } catch (error) {
      throw new Error(`Error saving config file: ${error}`);
    }
  }

  private validateConfig(): void {
    const required: { [key: string]: string[] } = {
      github: ['owner', 'repo', 'projectNumber'],
      plane: ['baseUrl', 'workspaceSlug', 'projectSlug'],
      sync: ['direction', 'autoConvertBacklogItems'],
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
        owner: 'your-github-username',
        repo: 'your-repo-name',
        projectNumber: 1,
        isOrgProject: false,
      },
      plane: {
        baseUrl: 'https://your-plane-instance.com',
        workspaceSlug: 'your-workspace',
        projectSlug: 'your-project',
      },
      sync: {
        direction: 'both',
        autoConvertBacklogItems: false,
      },
    };

    const configPath = outputPath || DEFAULT_CONFIG_PATH;
    fs.writeFileSync(configPath, JSON.stringify(defaultConfig, null, 2));
    console.log(`Created default configuration at ${configPath}`);
  }

  public getSyncState(): SyncState {
    if (!fs.existsSync(this.syncStatePath)) {
      return {
        lastSync: null,
        issues: {},
      };
    }

    try {
      const stateData = fs.readFileSync(this.syncStatePath, 'utf8');
      return JSON.parse(stateData);
    } catch (error) {
      throw new Error(`Error reading sync state file: ${error}`);
    }
  }

  public saveSyncState(state: SyncState): void {
    try {
      fs.writeFileSync(this.syncStatePath, JSON.stringify(state, null, 2));
    } catch (error) {
      throw new Error(`Error saving sync state file: ${error}`);
    }
  }
}
