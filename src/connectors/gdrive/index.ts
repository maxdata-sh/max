import { google, drive_v3 } from 'googleapis';
import type { ConfigManager } from '../../core/config-manager.js';
import { EntityStore } from '../../core/entity-store.js';
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
import { gdriveSchema } from './schema.js';
import {
  authenticate,
  getOAuthConfig,
  createAuthenticatedClient,
  type GDriveCredentials,
} from './auth.js';
import { canExtractContent, extractContent } from './content.js';

const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

export class GoogleDriveConnector implements Connector {
  readonly type = 'gdrive';
  readonly schema: EntitySchema = gdriveSchema;

  private config: ConfigManager;
  private drive: drive_v3.Drive | null = null;
  private store: EntityStore | null = null;
  private folderPaths: Map<string, string> = new Map();

  constructor(config: ConfigManager) {
    this.config = config;
  }

  /**
   * Get or initialize the entity store
   */
  private async getStore(): Promise<EntityStore> {
    if (!this.store) {
      this.store = new EntityStore(this.config);
      await this.store.initialize();
    }
    return this.store;
  }

  /**
   * Authenticate with Google Drive
   */
  async authenticate(): Promise<Credentials> {
    return authenticate(this.config);
  }

  /**
   * Initialize the Drive API client
   */
  private async initializeDrive(): Promise<drive_v3.Drive> {
    if (this.drive) return this.drive;

    const creds = this.config.loadCredentials(this.type) as GDriveCredentials | null;
    if (!creds) {
      throw new Error('Not authenticated. Run "max connect gdrive" first.');
    }

    const oauthConfig = getOAuthConfig(this.config);
    const auth = createAuthenticatedClient(creds, oauthConfig);

    // Handle token refresh
    auth.on('tokens', async (tokens) => {
      if (tokens.refresh_token || tokens.access_token) {
        const newCredentials: GDriveCredentials = {
          accessToken: tokens.access_token || creds.accessToken,
          refreshToken: tokens.refresh_token || creds.refreshToken,
          expiryDate: tokens.expiry_date || creds.expiryDate,
        };
        await this.config.saveCredentials(this.type, newCredentials);
      }
    });

    this.drive = google.drive({ version: 'v3', auth });
    return this.drive;
  }

  /**
   * Sync all files and folders from Google Drive
   */
  async *sync(options?: SyncOptions): AsyncIterable<RawEntity> {
    const drive = await this.initializeDrive();

    // First pass: build folder hierarchy
    console.log('Building folder hierarchy...');
    await this.buildFolderHierarchy(drive);

    // Second pass: yield all files and folders
    let pageToken: string | undefined;

    do {
      const response = await drive.files.list({
        pageSize: 100,
        pageToken,
        fields: 'nextPageToken, files(id, name, mimeType, parents, owners, permissions, size, createdTime, modifiedTime)',
        q: "trashed = false",
      });

      const files = response.data.files || [];

      for (const file of files) {
        const entity = this.fileToEntity(file);
        yield entity;
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);
  }

  /**
   * Get a single file by ID
   */
  async get(id: string): Promise<RawEntity | null> {
    const drive = await this.initializeDrive();

    try {
      const response = await drive.files.get({
        fileId: id,
        fields: 'id, name, mimeType, parents, owners, permissions, size, createdTime, modifiedTime',
      });

      // Ensure folder paths are loaded
      if (this.folderPaths.size === 0) {
        await this.buildFolderHierarchy(drive);
      }

      return this.fileToEntity(response.data);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get content for a file
   */
  async getContent(id: string): Promise<ContentBlob | null> {
    const drive = await this.initializeDrive();
    const store = await this.getStore();

    try {
      // Look up mimeType from store first (avoids API call)
      const entity = await store.get(this.type, id);
      let mimeType = entity?.properties.mimeType as string | undefined;

      // Fall back to API if not in store
      if (!mimeType) {
        const response = await drive.files.get({
          fileId: id,
          fields: 'mimeType',
        });
        mimeType = response.data.mimeType || undefined;
      }

      if (!mimeType || !canExtractContent(mimeType)) {
        return null;
      }

      return extractContent(drive, id, mimeType);
    } catch (error) {
      return null;
    }
  }

  /**
   * Build folder hierarchy for path resolution
   */
  private async buildFolderHierarchy(drive: drive_v3.Drive): Promise<void> {
    this.folderPaths.clear();
    const folderParents = new Map<string, string | null>();

    // Fetch all folders
    let pageToken: string | undefined;
    const folders: { id: string; name: string; parent: string | null }[] = [];

    do {
      const response = await drive.files.list({
        pageSize: 1000,
        pageToken,
        fields: 'nextPageToken, files(id, name, parents)',
        q: `mimeType = '${FOLDER_MIME_TYPE}' and trashed = false`,
      });

      const files = response.data.files || [];
      for (const file of files) {
        folders.push({
          id: file.id!,
          name: file.name!,
          parent: file.parents?.[0] || null,
        });
        folderParents.set(file.id!, file.parents?.[0] || null);
      }

      pageToken = response.data.nextPageToken ?? undefined;
    } while (pageToken);

    // Build paths for all folders
    for (const folder of folders) {
      this.folderPaths.set(folder.id, this.buildPath(folder.id, folder.name, folderParents, folders));
    }
  }

  /**
   * Build full path for a folder
   */
  private buildPath(
    id: string,
    name: string,
    folderParents: Map<string, string | null>,
    folders: { id: string; name: string; parent: string | null }[]
  ): string {
    const parts: string[] = [name];
    let currentId: string | null = folderParents.get(id) || null;

    while (currentId) {
      const folder = folders.find(f => f.id === currentId);
      if (!folder) break;
      parts.unshift(folder.name);
      currentId = folderParents.get(currentId) || null;
    }

    return '/' + parts.join('/');
  }

  /**
   * Get the path for a file
   */
  private getFilePath(parentId: string | null, fileName: string): string {
    if (!parentId) {
      return '/' + fileName;
    }

    const parentPath = this.folderPaths.get(parentId);
    if (!parentPath) {
      return '/' + fileName;
    }

    return parentPath + '/' + fileName;
  }

  /**
   * Get formatter for an entity type
   */
  getFormatter(_entityType: string): EntityFormatter {
    // Both file and folder use the same formatting
    return {
      defaultFields: ['name', 'path', 'owner', 'modifiedAt', 'mimeType'],
      transforms: {
        modifiedAt: (value) => value ? new Date(value as string).toISOString().split('T')[0] : '',
        mimeType: (value) => value ? formatMimeType(value as string) : '',
      },
    };
  }

  /**
   * Convert a Google Drive file to a RawEntity
   */
  private fileToEntity(file: drive_v3.Schema$File): RawEntity {
    const isFolder = file.mimeType === FOLDER_MIME_TYPE;
    const parentId = file.parents?.[0] || null;

    // Get the path
    let path: string;
    if (isFolder) {
      path = this.folderPaths.get(file.id!) || '/' + file.name;
    } else {
      path = this.getFilePath(parentId, file.name!);
    }

    // Extract owner
    const owner = file.owners?.[0]?.emailAddress || 'unknown';

    // Convert permissions
    const permissions: SourcePermission[] = (file.permissions || []).map(perm => ({
      type: perm.type as 'user' | 'group' | 'domain' | 'anyone',
      role: perm.role as 'owner' | 'writer' | 'reader',
      email: perm.emailAddress || undefined,
      domain: perm.domain || undefined,
    }));

    return {
      id: file.id!,
      type: isFolder ? 'folder' : 'file',
      sourceType: 'gdrive',
      properties: {
        id: file.id,
        name: file.name,
        mimeType: file.mimeType,
        path,
        owner,
        size: file.size ? parseInt(file.size, 10) : 0,
        createdAt: file.createdTime,
        modifiedAt: file.modifiedTime,
        parentId,
      },
      permissions,
      raw: file,
    };
  }
}

function formatMimeType(mimeType: string): string {
  const mappings: Record<string, string> = {
    'application/vnd.google-apps.document': 'Google Doc',
    'application/vnd.google-apps.spreadsheet': 'Google Sheet',
    'application/vnd.google-apps.presentation': 'Google Slides',
    'application/vnd.google-apps.folder': 'Folder',
    'application/pdf': 'PDF',
    'text/plain': 'Text',
    'text/markdown': 'Markdown',
    'application/json': 'JSON',
  };
  return mappings[mimeType] || mimeType;
}
