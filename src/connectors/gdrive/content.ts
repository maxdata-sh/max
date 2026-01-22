import type { drive_v3 } from 'googleapis';
import type { ContentBlob } from '../../types/connector.js';

// MIME types we can extract content from
const EXPORTABLE_TYPES: Record<string, { mimeType: string; exportMime: string }> = {
  'application/vnd.google-apps.document': {
    mimeType: 'text/plain',
    exportMime: 'text/plain',
  },
  'application/vnd.google-apps.spreadsheet': {
    mimeType: 'text/csv',
    exportMime: 'text/csv',
  },
};

const DOWNLOADABLE_TYPES = [
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/html',
  'application/json',
  'application/xml',
  'text/xml',
  'application/yaml',
  'text/yaml',
];

/**
 * Check if we can extract content from a file
 */
export function canExtractContent(mimeType: string): boolean {
  return mimeType in EXPORTABLE_TYPES || DOWNLOADABLE_TYPES.includes(mimeType);
}

/**
 * Extract content from a Google Drive file
 */
export async function extractContent(
  drive: drive_v3.Drive,
  fileId: string,
  mimeType: string
): Promise<ContentBlob | null> {
  try {
    // Handle Google Workspace documents (need to export)
    if (mimeType in EXPORTABLE_TYPES) {
      const exportConfig = EXPORTABLE_TYPES[mimeType];

      const response = await drive.files.export({
        fileId,
        mimeType: exportConfig.exportMime,
      }, { responseType: 'text' });

      return {
        mimeType: exportConfig.mimeType,
        content: response.data as string,
        extractedAt: new Date(),
      };
    }

    // Handle regular downloadable files
    if (DOWNLOADABLE_TYPES.includes(mimeType)) {
      const response = await drive.files.get({
        fileId,
        alt: 'media',
      }, { responseType: 'text' });

      return {
        mimeType,
        content: response.data as string,
        extractedAt: new Date(),
      };
    }

    return null;
  } catch (error) {
    // Log but don't fail - content extraction is best-effort
    console.error(`Failed to extract content for ${fileId}: ${error}`);
    return null;
  }
}
