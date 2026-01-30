import type { ConfigManager } from '../../core/config-manager.js';
import type {
  Connector,
  EntitySchema,
  EntityFormatter,
  Credentials,
  SyncOptions,
  RawEntity,
  SourcePermission,
  ContentBlob,
} from '../../types/connector.js';
import type { StoredEntity } from '../../types/entity.js';
import { hubspotSchema } from './schema.js';
import { promptForApiKey, validateApiKey } from './auth.js';

const HUBSPOT_API = 'https://api.hubapi.com';

interface HubSpotOwner {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

export class HubSpotConnector implements Connector {
  readonly type = 'hubspot';
  readonly schema: EntitySchema = hubspotSchema;

  private config: ConfigManager;
  private apiKey: string | null = null;
  private owners: Map<string, HubSpotOwner> = new Map();
  private portalId: string | null = null;

  constructor(config: ConfigManager) {
    this.config = config;
  }

  /**
   * Authenticate with HubSpot
   */
  async authenticate(): Promise<Credentials> {
    const apiKey = await promptForApiKey();

    console.log('\nValidating access token...');
    const valid = await validateApiKey(apiKey);
    if (!valid) {
      throw new Error('Invalid access token. Please check and try again.');
    }

    return { apiKey };
  }

  /**
   * Get formatter for an entity type
   */
  getFormatter(entityType: string): EntityFormatter {
    switch (entityType) {
      case 'contact':
        return {
          defaultFields: ['name', 'email', 'company', 'jobTitle', 'lifecycleStage', 'owner'],
          transforms: {
            name: (_value, entity) => {
              const props = entity.properties;
              return [props.firstName, props.lastName].filter(Boolean).join(' ') || '(unnamed)';
            },
          },
        };
      case 'company':
        return {
          defaultFields: ['name', 'domain', 'industry', 'location', 'owner'],
          transforms: {
            location: (_value, entity) => {
              const props = entity.properties;
              return [props.city, props.state, props.country].filter(Boolean).join(', ');
            },
          },
        };
      case 'deal':
        return {
          defaultFields: ['name', 'amount', 'stage', 'pipeline', 'closeDate', 'owner'],
          transforms: {
            amount: (value) => value ? `$${Number(value).toLocaleString()}` : '',
            closeDate: (value) => value ? new Date(value as string).toISOString().split('T')[0] : '',
          },
        };
      default:
        return {
          defaultFields: ['name'],
        };
    }
  }

  /**
   * Get API key from stored credentials
   */
  private getApiKey(): string {
    if (this.apiKey) return this.apiKey;

    const creds = this.config.loadCredentials(this.type);
    if (!creds?.apiKey) {
      throw new Error('Not authenticated. Run "max connect hubspot" first.');
    }

    this.apiKey = creds.apiKey as string;
    return this.apiKey;
  }

  /**
   * Make an API request to HubSpot
   */
  private async request<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
    const apiKey = this.getApiKey();

    const url = new URL(`${HUBSPOT_API}${endpoint}`);
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
      });
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HubSpot API error: ${response.status} ${response.statusText} - ${text}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Load owners for name resolution
   */
  private async loadOwners(): Promise<void> {
    if (this.owners.size > 0) return;

    try {
      const data = await this.request<{
        results: Array<{
          id: string;
          email: string;
          firstName: string;
          lastName: string;
        }>;
      }>('/crm/v3/owners');

      for (const owner of data.results) {
        this.owners.set(owner.id, owner);
      }
    } catch {
      // Owners endpoint may fail with insufficient permissions
    }
  }

  /**
   * Get owner name by ID
   */
  private getOwnerName(ownerId: string | null): string {
    if (!ownerId) return '';
    const owner = this.owners.get(ownerId);
    if (!owner) return ownerId;
    return owner.email || `${owner.firstName} ${owner.lastName}`.trim() || ownerId;
  }

  /**
   * Get portal ID for building URLs
   */
  private async getPortalId(): Promise<string> {
    if (this.portalId) return this.portalId;

    try {
      const data = await this.request<{ portalId: number }>('/account-info/v3/details');
      this.portalId = String(data.portalId);
    } catch {
      this.portalId = '';
    }

    return this.portalId;
  }

  /**
   * Build a HubSpot URL for an entity
   */
  private buildUrl(type: string, id: string, portalId: string): string {
    if (!portalId) return '';
    const typeMap: Record<string, string> = {
      contact: 'contacts',
      company: 'companies',
      deal: 'deals',
    };
    return `https://app.hubspot.com/contacts/${portalId}/${typeMap[type] || type}/${id}`;
  }

  /**
   * Sync all data from HubSpot
   */
  async *sync(options?: SyncOptions): AsyncIterable<RawEntity> {
    // Load owners first for name resolution
    console.log('Loading owners...');
    await this.loadOwners();

    // Get portal ID for URLs
    const portalId = await this.getPortalId();

    // Sync contacts
    console.log('Syncing contacts...');
    yield* this.syncContacts(portalId);

    // Sync companies
    console.log('Syncing companies...');
    yield* this.syncCompanies(portalId);

    // Sync deals
    console.log('Syncing deals...');
    yield* this.syncDeals(portalId);
  }

  /**
   * Sync all contacts
   */
  private async *syncContacts(portalId: string): AsyncIterable<RawEntity> {
    let after: string | undefined;

    const properties = [
      'firstname', 'lastname', 'email', 'phone', 'company',
      'jobtitle', 'lifecyclestage', 'hubspot_owner_id',
      'createdate', 'lastmodifieddate',
    ];

    do {
      const params: Record<string, string> = {
        limit: '100',
        properties: properties.join(','),
      };
      if (after) {
        params.after = after;
      }

      const data = await this.request<{
        results: Array<{
          id: string;
          properties: Record<string, string | null>;
          createdAt: string;
          updatedAt: string;
        }>;
        paging?: { next?: { after: string } };
      }>('/crm/v3/objects/contacts', params);

      for (const contact of data.results) {
        const props = contact.properties;
        yield {
          id: contact.id,
          type: 'contact',
          sourceType: 'hubspot',
          properties: {
            id: contact.id,
            email: props.email || '',
            firstName: props.firstname || '',
            lastName: props.lastname || '',
            phone: props.phone || '',
            company: props.company || '',
            jobTitle: props.jobtitle || '',
            lifecycleStage: props.lifecyclestage || '',
            owner: this.getOwnerName(props.hubspot_owner_id),
            createdAt: contact.createdAt,
            updatedAt: contact.updatedAt,
            url: this.buildUrl('contact', contact.id, portalId),
          },
          permissions: this.defaultPermissions(),
          raw: contact,
        };
      }

      after = data.paging?.next?.after;
    } while (after);
  }

  /**
   * Sync all companies
   */
  private async *syncCompanies(portalId: string): AsyncIterable<RawEntity> {
    let after: string | undefined;

    const properties = [
      'name', 'domain', 'industry', 'phone',
      'city', 'state', 'country', 'hubspot_owner_id',
      'createdate', 'hs_lastmodifieddate',
    ];

    do {
      const params: Record<string, string> = {
        limit: '100',
        properties: properties.join(','),
      };
      if (after) {
        params.after = after;
      }

      const data = await this.request<{
        results: Array<{
          id: string;
          properties: Record<string, string | null>;
          createdAt: string;
          updatedAt: string;
        }>;
        paging?: { next?: { after: string } };
      }>('/crm/v3/objects/companies', params);

      for (const company of data.results) {
        const props = company.properties;
        yield {
          id: company.id,
          type: 'company',
          sourceType: 'hubspot',
          properties: {
            id: company.id,
            name: props.name || '',
            domain: props.domain || '',
            industry: props.industry || '',
            phone: props.phone || '',
            city: props.city || '',
            state: props.state || '',
            country: props.country || '',
            owner: this.getOwnerName(props.hubspot_owner_id),
            createdAt: company.createdAt,
            updatedAt: company.updatedAt,
            url: this.buildUrl('company', company.id, portalId),
          },
          permissions: this.defaultPermissions(),
          raw: company,
        };
      }

      after = data.paging?.next?.after;
    } while (after);
  }

  /**
   * Sync all deals
   */
  private async *syncDeals(portalId: string): AsyncIterable<RawEntity> {
    let after: string | undefined;

    const properties = [
      'dealname', 'dealstage', 'pipeline', 'amount',
      'closedate', 'hubspot_owner_id',
      'createdate', 'hs_lastmodifieddate',
    ];

    do {
      const params: Record<string, string> = {
        limit: '100',
        properties: properties.join(','),
      };
      if (after) {
        params.after = after;
      }

      const data = await this.request<{
        results: Array<{
          id: string;
          properties: Record<string, string | null>;
          createdAt: string;
          updatedAt: string;
        }>;
        paging?: { next?: { after: string } };
      }>('/crm/v3/objects/deals', params);

      for (const deal of data.results) {
        const props = deal.properties;
        yield {
          id: deal.id,
          type: 'deal',
          sourceType: 'hubspot',
          properties: {
            id: deal.id,
            name: props.dealname || '',
            stage: props.dealstage || '',
            pipeline: props.pipeline || '',
            amount: props.amount ? parseFloat(props.amount) : 0,
            closeDate: props.closedate || '',
            owner: this.getOwnerName(props.hubspot_owner_id),
            createdAt: deal.createdAt,
            updatedAt: deal.updatedAt,
            url: this.buildUrl('deal', deal.id, portalId),
          },
          permissions: this.defaultPermissions(),
          raw: deal,
        };
      }

      after = data.paging?.next?.after;
    } while (after);
  }

  /**
   * Get a single entity by ID
   */
  async get(id: string): Promise<RawEntity | null> {
    await this.loadOwners();
    const portalId = await this.getPortalId();

    // Try contact first
    try {
      const properties = [
        'firstname', 'lastname', 'email', 'phone', 'company',
        'jobtitle', 'lifecyclestage', 'hubspot_owner_id',
      ];

      const contact = await this.request<{
        id: string;
        properties: Record<string, string | null>;
        createdAt: string;
        updatedAt: string;
      }>(`/crm/v3/objects/contacts/${id}`, { properties: properties.join(',') });

      const props = contact.properties;
      return {
        id: contact.id,
        type: 'contact',
        sourceType: 'hubspot',
        properties: {
          id: contact.id,
          email: props.email || '',
          firstName: props.firstname || '',
          lastName: props.lastname || '',
          phone: props.phone || '',
          company: props.company || '',
          jobTitle: props.jobtitle || '',
          lifecycleStage: props.lifecyclestage || '',
          owner: this.getOwnerName(props.hubspot_owner_id),
          createdAt: contact.createdAt,
          updatedAt: contact.updatedAt,
          url: this.buildUrl('contact', contact.id, portalId),
        },
        permissions: this.defaultPermissions(),
        raw: contact,
      };
    } catch {
      // Not a contact, try other types
    }

    // Try company
    try {
      const properties = [
        'name', 'domain', 'industry', 'phone',
        'city', 'state', 'country', 'hubspot_owner_id',
      ];

      const company = await this.request<{
        id: string;
        properties: Record<string, string | null>;
        createdAt: string;
        updatedAt: string;
      }>(`/crm/v3/objects/companies/${id}`, { properties: properties.join(',') });

      const props = company.properties;
      return {
        id: company.id,
        type: 'company',
        sourceType: 'hubspot',
        properties: {
          id: company.id,
          name: props.name || '',
          domain: props.domain || '',
          industry: props.industry || '',
          phone: props.phone || '',
          city: props.city || '',
          state: props.state || '',
          country: props.country || '',
          owner: this.getOwnerName(props.hubspot_owner_id),
          createdAt: company.createdAt,
          updatedAt: company.updatedAt,
          url: this.buildUrl('company', company.id, portalId),
        },
        permissions: this.defaultPermissions(),
        raw: company,
      };
    } catch {
      // Not a company, try deal
    }

    // Try deal
    try {
      const properties = [
        'dealname', 'dealstage', 'pipeline', 'amount',
        'closedate', 'hubspot_owner_id',
      ];

      const deal = await this.request<{
        id: string;
        properties: Record<string, string | null>;
        createdAt: string;
        updatedAt: string;
      }>(`/crm/v3/objects/deals/${id}`, { properties: properties.join(',') });

      const props = deal.properties;
      return {
        id: deal.id,
        type: 'deal',
        sourceType: 'hubspot',
        properties: {
          id: deal.id,
          name: props.dealname || '',
          stage: props.dealstage || '',
          pipeline: props.pipeline || '',
          amount: props.amount ? parseFloat(props.amount) : 0,
          closeDate: props.closedate || '',
          owner: this.getOwnerName(props.hubspot_owner_id),
          createdAt: deal.createdAt,
          updatedAt: deal.updatedAt,
          url: this.buildUrl('deal', deal.id, portalId),
        },
        permissions: this.defaultPermissions(),
        raw: deal,
      };
    } catch {
      // Not found
    }

    return null;
  }

  /**
   * Get content for an entity
   * HubSpot CRM objects don't have separate content like files
   */
  async getContent(id: string): Promise<ContentBlob | null> {
    return null;
  }

  /**
   * Default permissions for HubSpot entities
   * HubSpot doesn't have per-entity permissions like GDrive
   */
  private defaultPermissions(): SourcePermission[] {
    return [{
      type: 'domain',
      role: 'reader',
      domain: 'hubspot-portal',
    }];
  }
}
