import * as fs from 'fs';
import * as path from 'path';
import YAML from 'yaml';
import type { Credentials } from '../types/connector.js';

export interface MaxConfig {
  version: number;
  sources: SourceConfig[];
}

export interface SourceConfig {
  type: string;
  configured: boolean;
  lastSync?: string;
}

const DEFAULT_CONFIG: MaxConfig = {
  version: 1,
  sources: [],
};

export class ConfigManager {
  private projectDir: string;
  private maxDir: string;

  constructor(projectDir: string = '.') {
    this.projectDir = path.resolve(projectDir);
    this.maxDir = path.join(this.projectDir, '.max');
  }

  /**
   * Find a Max project by looking for .max directory in current and parent directories
   */
  static find(startDir: string = process.cwd()): ConfigManager | null {
    let currentDir = path.resolve(startDir);

    while (true) {
      const maxDir = path.join(currentDir, '.max');
      if (fs.existsSync(maxDir) && fs.statSync(maxDir).isDirectory()) {
        return new ConfigManager(currentDir);
      }

      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        // Reached filesystem root
        return null;
      }
      currentDir = parentDir;
    }
  }

  /**
   * Initialize a new Max project
   */
  async initialize(): Promise<void> {
    // Create directory structure
    const dirs = [
      this.maxDir,
      path.join(this.maxDir, 'credentials'),
      path.join(this.maxDir, 'store'),
      path.join(this.maxDir, 'store', 'content'),
      path.join(this.maxDir, 'rules'),
      path.join(this.maxDir, 'logs'),
    ];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    // Create config file
    const configPath = this.getConfigPath();
    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(configPath, YAML.stringify(DEFAULT_CONFIG));
    }

    // Create .gitignore for sensitive files
    const gitignorePath = path.join(this.maxDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      fs.writeFileSync(gitignorePath, 'credentials/\nstore/\nlogs/\nstate/\n');
    }
  }

  /**
   * Check if this is an initialized Max project
   */
  isInitialized(): boolean {
    return fs.existsSync(this.maxDir) && fs.existsSync(this.getConfigPath());
  }

  /**
   * Get the project root directory
   */
  getProjectDir(): string {
    return this.projectDir;
  }

  /**
   * Get the .max directory path
   */
  getMaxDir(): string {
    return this.maxDir;
  }

  /**
   * Get the config file path
   */
  getConfigPath(): string {
    return path.join(this.maxDir, 'config.yaml');
  }

  /**
   * Get the store directory path
   */
  getStoreDir(): string {
    return path.join(this.maxDir, 'store');
  }

  /**
   * Get the content directory path for a source
   */
  getContentDir(source: string): string {
    const contentDir = path.join(this.maxDir, 'store', 'content', source);
    if (!fs.existsSync(contentDir)) {
      fs.mkdirSync(contentDir, { recursive: true });
    }
    return contentDir;
  }

  /**
   * Get the credentials directory path
   */
  getCredentialsDir(): string {
    return path.join(this.maxDir, 'credentials');
  }

  /**
   * Get the rules directory path
   */
  getRulesDir(): string {
    return path.join(this.maxDir, 'rules');
  }

  /**
   * Get the database path
   */
  getDatabasePath(): string {
    return path.join(this.getStoreDir(), 'entities.db');
  }

  /**
   * Read the config file
   */
  readConfig(): MaxConfig {
    const configPath = this.getConfigPath();
    if (!fs.existsSync(configPath)) {
      return DEFAULT_CONFIG;
    }
    const content = fs.readFileSync(configPath, 'utf-8');
    return YAML.parse(content) as MaxConfig;
  }

  /**
   * Write the config file
   */
  writeConfig(config: MaxConfig): void {
    fs.writeFileSync(this.getConfigPath(), YAML.stringify(config));
  }

  /**
   * Save credentials for a source
   */
  async saveCredentials(source: string, credentials: Credentials): Promise<void> {
    const credPath = path.join(this.getCredentialsDir(), `${source}.json`);
    fs.writeFileSync(credPath, JSON.stringify(credentials, null, 2));
  }

  /**
   * Load credentials for a source
   */
  loadCredentials(source: string): Credentials | null {
    const credPath = path.join(this.getCredentialsDir(), `${source}.json`);
    if (!fs.existsSync(credPath)) {
      return null;
    }
    const content = fs.readFileSync(credPath, 'utf-8');
    return JSON.parse(content) as Credentials;
  }

  /**
   * Mark a source as configured
   */
  async markSourceConfigured(source: string): Promise<void> {
    const config = this.readConfig();
    const existing = config.sources.find(s => s.type === source);
    if (existing) {
      existing.configured = true;
    } else {
      config.sources.push({ type: source, configured: true });
    }
    this.writeConfig(config);
  }

  /**
   * Check if a source is configured
   */
  isSourceConfigured(source: string): boolean {
    const config = this.readConfig();
    const sourceConfig = config.sources.find(s => s.type === source);
    return sourceConfig?.configured ?? false;
  }

  /**
   * Update last sync timestamp for a source
   */
  async updateLastSync(source: string): Promise<void> {
    const config = this.readConfig();
    const sourceConfig = config.sources.find(s => s.type === source);
    if (sourceConfig) {
      sourceConfig.lastSync = new Date().toISOString();
    }
    this.writeConfig(config);
  }

  /**
   * Get last sync timestamp for a source
   */
  getLastSync(source: string): Date | null {
    const config = this.readConfig();
    const sourceConfig = config.sources.find(s => s.type === source);
    return sourceConfig?.lastSync ? new Date(sourceConfig.lastSync) : null;
  }
}
