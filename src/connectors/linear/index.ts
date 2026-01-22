import type { ConfigManager } from '../../core/config-manager.js';
import type {
  Connector,
  EntitySchema,
  Credentials,
  SyncOptions,
  RawEntity,
  SourcePermission,
  ContentBlob,
} from '../../types/connector.js';
import type { StoredEntity } from '../../types/entity.js';
import { linearSchema } from './schema.js';
import { promptForApiKey, validateApiKey } from './auth.js';

const LINEAR_API = 'https://api.linear.app/graphql';

export class LinearConnector implements Connector {
  readonly type = 'linear';
  readonly schema: EntitySchema = linearSchema;

  private config: ConfigManager;
  private apiKey: string | null = null;

  constructor(config: ConfigManager) {
    this.config = config;
  }

  /**
   * Authenticate with Linear
   */
  async authenticate(): Promise<Credentials> {
    const apiKey = await promptForApiKey();

    console.log('\nValidating API key...');
    const valid = await validateApiKey(apiKey);
    if (!valid) {
      throw new Error('Invalid API key. Please check and try again.');
    }

    // Return credentials - connect handler saves them
    return { apiKey };
  }

  /**
   * Format an entity for text display
   */
  formatEntity(entity: StoredEntity): string {
    const props = entity.properties;
    const lines: string[] = [];

    switch (entity.type) {
      case 'issue': {
        const identifier = props.identifier || entity.id;
        const title = props.title || '(untitled)';
        const state = props.state || 'Unknown';
        lines.push(`${identifier}  ${title}`);
        lines.push(`   State: ${state}`);
        if (props.assignee) {
          lines.push(`   Assignee: ${props.assignee}`);
        }
        if (props.team) {
          lines.push(`   Team: ${props.team}`);
        }
        if (props.labels && Array.isArray(props.labels) && props.labels.length > 0) {
          lines.push(`   Labels: ${props.labels.join(', ')}`);
        }
        if (props.updatedAt) {
          const date = new Date(props.updatedAt as string);
          lines.push(`   Updated: ${date.toISOString().split('T')[0]}`);
        }
        break;
      }
      case 'project': {
        const name = props.name || entity.id;
        const state = props.state || '';
        lines.push(`${name}${state ? ` [${state}]` : ''}`);
        if (props.description) {
          const desc = String(props.description).substring(0, 80);
          lines.push(`   ${desc}${String(props.description).length > 80 ? '...' : ''}`);
        }
        if (props.lead) {
          lines.push(`   Lead: ${props.lead}`);
        }
        if (props.targetDate) {
          lines.push(`   Target: ${props.targetDate}`);
        }
        break;
      }
      case 'comment': {
        const author = props.author || 'Unknown';
        const issueId = props.issueIdentifier || props.issueId || '';
        lines.push(`Comment on ${issueId} by ${author}`);
        if (props.body) {
          const body = String(props.body).substring(0, 100).replace(/\n/g, ' ');
          lines.push(`   ${body}${String(props.body).length > 100 ? '...' : ''}`);
        }
        if (props.createdAt) {
          const date = new Date(props.createdAt as string);
          lines.push(`   Created: ${date.toISOString().split('T')[0]}`);
        }
        break;
      }
      default: {
        lines.push(`${props.name || props.title || entity.id}`);
        if (props.description) {
          const desc = String(props.description).substring(0, 80);
          lines.push(`   ${desc}${String(props.description).length > 80 ? '...' : ''}`);
        }
      }
    }

    return lines.join('\n');
  }

  /**
   * Get API key from stored credentials
   */
  private getApiKey(): string {
    if (this.apiKey) return this.apiKey;

    const creds = this.config.loadCredentials(this.type);
    if (!creds?.apiKey) {
      throw new Error('Not authenticated. Run "max connect linear" first.');
    }

    this.apiKey = creds.apiKey as string;
    return this.apiKey;
  }

  /**
   * Make a GraphQL request to Linear
   */
  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const apiKey = this.getApiKey();

    const response = await fetch(LINEAR_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!response.ok) {
      throw new Error(`Linear API error: ${response.status} ${response.statusText}`);
    }

    const json = await response.json() as { data?: T; errors?: Array<{ message: string }> };

    if (json.errors?.length) {
      throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
    }

    return json.data as T;
  }

  /**
   * Sync all data from Linear
   */
  async *sync(options?: SyncOptions): AsyncIterable<RawEntity> {
    // Sync projects first
    console.log('Syncing projects...');
    yield* this.syncProjects();

    // Then issues
    console.log('Syncing issues...');
    yield* this.syncIssues();

    // Then comments
    console.log('Syncing comments...');
    yield* this.syncComments();
  }

  /**
   * Sync all projects
   */
  private async *syncProjects(): AsyncIterable<RawEntity> {
    let hasMore = true;
    let cursor: string | undefined;

    while (hasMore) {
      const data = await this.graphql<{
        projects: {
          nodes: Array<{
            id: string;
            name: string;
            description: string;
            state: string;
            lead: { name: string; email: string } | null;
            teams: { nodes: Array<{ name: string }> };
            startDate: string | null;
            targetDate: string | null;
            createdAt: string;
            updatedAt: string;
            url: string;
          }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      }>(`
        query Projects($cursor: String) {
          projects(first: 100, after: $cursor) {
            nodes {
              id
              name
              description
              state
              lead { name email }
              teams { nodes { name } }
              startDate
              targetDate
              createdAt
              updatedAt
              url
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, { cursor });

      for (const project of data.projects.nodes) {
        yield {
          id: project.id,
          type: 'project',
          sourceType: 'linear',
          properties: {
            id: project.id,
            name: project.name,
            description: project.description || '',
            state: project.state,
            lead: project.lead?.email || project.lead?.name || '',
            team: project.teams.nodes[0]?.name || '',
            startDate: project.startDate,
            targetDate: project.targetDate,
            createdAt: project.createdAt,
            updatedAt: project.updatedAt,
            url: project.url,
          },
          permissions: this.defaultPermissions(),
          raw: project,
        };
      }

      hasMore = data.projects.pageInfo.hasNextPage;
      cursor = data.projects.pageInfo.endCursor;
    }
  }

  /**
   * Sync all issues
   */
  private async *syncIssues(): AsyncIterable<RawEntity> {
    let hasMore = true;
    let cursor: string | undefined;

    while (hasMore) {
      const data = await this.graphql<{
        issues: {
          nodes: Array<{
            id: string;
            identifier: string;
            title: string;
            description: string | null;
            state: { name: string };
            priority: number;
            assignee: { name: string; email: string } | null;
            creator: { name: string; email: string } | null;
            project: { id: string; name: string } | null;
            team: { name: string };
            labels: { nodes: Array<{ name: string }> };
            createdAt: string;
            updatedAt: string;
            completedAt: string | null;
            url: string;
          }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      }>(`
        query Issues($cursor: String) {
          issues(first: 100, after: $cursor) {
            nodes {
              id
              identifier
              title
              description
              state { name }
              priority
              assignee { name email }
              creator { name email }
              project { id name }
              team { name }
              labels { nodes { name } }
              createdAt
              updatedAt
              completedAt
              url
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, { cursor });

      for (const issue of data.issues.nodes) {
        yield {
          id: issue.id,
          type: 'issue',
          sourceType: 'linear',
          properties: {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description || '',
            state: issue.state.name,
            priority: issue.priority,
            assignee: issue.assignee?.email || issue.assignee?.name || '',
            creator: issue.creator?.email || issue.creator?.name || '',
            project: issue.project?.name || '',
            projectId: issue.project?.id || '',
            team: issue.team.name,
            labels: issue.labels.nodes.map(l => l.name),
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
            completedAt: issue.completedAt,
            url: issue.url,
          },
          permissions: this.defaultPermissions(),
          raw: issue,
        };
      }

      hasMore = data.issues.pageInfo.hasNextPage;
      cursor = data.issues.pageInfo.endCursor;
    }
  }

  /**
   * Sync all comments
   */
  private async *syncComments(): AsyncIterable<RawEntity> {
    let hasMore = true;
    let cursor: string | undefined;

    while (hasMore) {
      const data = await this.graphql<{
        comments: {
          nodes: Array<{
            id: string;
            body: string;
            user: { name: string; email: string } | null;
            issue: { id: string; identifier: string };
            createdAt: string;
            updatedAt: string;
            url: string;
          }>;
          pageInfo: { hasNextPage: boolean; endCursor: string };
        };
      }>(`
        query Comments($cursor: String) {
          comments(first: 100, after: $cursor) {
            nodes {
              id
              body
              user { name email }
              issue { id identifier }
              createdAt
              updatedAt
              url
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      `, { cursor });

      for (const comment of data.comments.nodes) {
        yield {
          id: comment.id,
          type: 'comment',
          sourceType: 'linear',
          properties: {
            id: comment.id,
            body: comment.body,
            author: comment.user?.email || comment.user?.name || '',
            issueId: comment.issue.id,
            issueIdentifier: comment.issue.identifier,
            createdAt: comment.createdAt,
            updatedAt: comment.updatedAt,
            url: comment.url,
          },
          permissions: this.defaultPermissions(),
          raw: comment,
        };
      }

      hasMore = data.comments.pageInfo.hasNextPage;
      cursor = data.comments.pageInfo.endCursor;
    }
  }

  /**
   * Get a single entity by ID
   */
  async get(id: string): Promise<RawEntity | null> {
    // Try to fetch as issue first (most common)
    try {
      const data = await this.graphql<{
        issue: {
          id: string;
          identifier: string;
          title: string;
          description: string | null;
          state: { name: string };
          priority: number;
          assignee: { name: string; email: string } | null;
          creator: { name: string; email: string } | null;
          project: { id: string; name: string } | null;
          team: { name: string };
          labels: { nodes: Array<{ name: string }> };
          createdAt: string;
          updatedAt: string;
          completedAt: string | null;
          url: string;
        } | null;
      }>(`
        query Issue($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            description
            state { name }
            priority
            assignee { name email }
            creator { name email }
            project { id name }
            team { name }
            labels { nodes { name } }
            createdAt
            updatedAt
            completedAt
            url
          }
        }
      `, { id });

      if (data.issue) {
        const issue = data.issue;
        return {
          id: issue.id,
          type: 'issue',
          sourceType: 'linear',
          properties: {
            id: issue.id,
            identifier: issue.identifier,
            title: issue.title,
            description: issue.description || '',
            state: issue.state.name,
            priority: issue.priority,
            assignee: issue.assignee?.email || issue.assignee?.name || '',
            creator: issue.creator?.email || issue.creator?.name || '',
            project: issue.project?.name || '',
            projectId: issue.project?.id || '',
            team: issue.team.name,
            labels: issue.labels.nodes.map(l => l.name),
            createdAt: issue.createdAt,
            updatedAt: issue.updatedAt,
            completedAt: issue.completedAt,
            url: issue.url,
          },
          permissions: this.defaultPermissions(),
          raw: issue,
        };
      }
    } catch {
      // Not an issue, try other types
    }

    return null;
  }

  /**
   * Get content for an entity (issue description or comment body)
   */
  async getContent(id: string): Promise<ContentBlob | null> {
    // Linear content is already in the description/body fields
    // No separate content extraction needed
    return null;
  }

  /**
   * Default permissions for Linear entities
   * Linear doesn't have per-entity permissions like GDrive
   */
  private defaultPermissions(): SourcePermission[] {
    return [{
      type: 'domain',
      role: 'reader',
      domain: 'linear-workspace',
    }];
  }
}
