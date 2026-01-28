import type { ConfigManager } from './config-manager.js';
import type { Connector, Credentials } from '../types/connector.js';

export type ConnectorType = 'gdrive' | 'linear' | 'hubspot';

export class ConnectorRegistry {
  private config: ConfigManager;
  private connectors: Map<string, Connector> = new Map();

  constructor(config: ConfigManager) {
    this.config = config;
  }

  /**
   * List available connector types
   */
  list(): ConnectorType[] {
    return ['gdrive', 'linear', 'hubspot'];
  }

  /**
   * Get a connector instance (lazy-loaded)
   */
  async get(type: string): Promise<Connector | null> {
    // Return cached instance if available
    if (this.connectors.has(type)) {
      return this.connectors.get(type)!;
    }

    // Dynamically load connector
    switch (type) {
      case 'gdrive': {
        const { GoogleDriveConnector } = await import('../connectors/gdrive/index.js');
        const connector = new GoogleDriveConnector(this.config);
        this.connectors.set(type, connector);
        return connector;
      }
      case 'linear': {
        const { LinearConnector } = await import('../connectors/linear/index.js');
        const connector = new LinearConnector(this.config);
        this.connectors.set(type, connector);
        return connector;
      }
      case 'hubspot': {
        const { HubSpotConnector } = await import('../connectors/hubspot/index.js');
        const connector = new HubSpotConnector(this.config);
        this.connectors.set(type, connector);
        return connector;
      }
      default:
        return null;
    }
  }

  /**
   * Register credentials for a connector
   */
  async configure(type: string, credentials: Credentials): Promise<void> {
    await this.config.saveCredentials(type, credentials);
    await this.config.markSourceConfigured(type);
  }

  /**
   * Check if a connector is configured and ready
   */
  isReady(type: string): boolean {
    return this.config.isSourceConfigured(type) && this.config.loadCredentials(type) !== null;
  }
}
