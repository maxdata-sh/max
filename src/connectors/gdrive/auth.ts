import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import type { Credentials } from '../../types/connector.js';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const REDIRECT_PORT = 3847;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}/oauth2callback`;

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Get OAuth configuration from environment variables
 */
export function getOAuthConfig(): OAuthConfig {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Missing Google OAuth credentials.\n\n' +
      'To connect to Google Drive, you need to set up OAuth credentials:\n\n' +
      '1. Go to https://console.cloud.google.com/apis/credentials\n' +
      '2. Create a new OAuth 2.0 Client ID (Desktop app type)\n' +
      '3. Add http://localhost:3847/oauth2callback to authorized redirect URIs\n' +
      '4. Set environment variables:\n' +
      '   export GOOGLE_CLIENT_ID="your-client-id"\n' +
      '   export GOOGLE_CLIENT_SECRET="your-client-secret"\n\n' +
      'Then run "max connect gdrive" again.'
    );
  }

  return { clientId, clientSecret };
}

/**
 * Create an OAuth2 client
 */
export function createOAuth2Client(config: OAuthConfig) {
  return new google.auth.OAuth2(config.clientId, config.clientSecret, REDIRECT_URI);
}

/**
 * Perform OAuth flow and return credentials
 */
export async function authenticate(): Promise<Credentials> {
  const config = getOAuthConfig();
  const oauth2Client = createOAuth2Client(config);

  // Generate auth URL
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force to get refresh token
  });

  // Start local server to handle callback
  return new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const parsedUrl = url.parse(req.url || '', true);

        if (parsedUrl.pathname === '/oauth2callback') {
          const code = parsedUrl.query.code as string;

          if (!code) {
            res.writeHead(400);
            res.end('No authorization code received');
            server.close();
            reject(new Error('No authorization code received'));
            return;
          }

          // Exchange code for tokens
          const { tokens } = await oauth2Client.getToken(code);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Max - Google Drive Connected</title></head>
            <body style="font-family: system-ui; padding: 40px; text-align: center;">
              <h1>Successfully connected to Google Drive!</h1>
              <p>You can close this window and return to the terminal.</p>
            </body>
            </html>
          `);

          server.close();

          resolve({
            accessToken: tokens.access_token!,
            refreshToken: tokens.refresh_token!,
            expiryDate: tokens.expiry_date!,
          });
        }
      } catch (error) {
        res.writeHead(500);
        res.end('Authentication failed');
        server.close();
        reject(error);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`\nOpening browser for Google OAuth...`);
      console.log(`If the browser doesn't open, visit this URL:\n${authUrl}\n`);

      // Try to open browser
      const open = async (url: string) => {
        const { exec } = await import('child_process');
        const platform = process.platform;

        if (platform === 'darwin') {
          exec(`open "${url}"`);
        } else if (platform === 'win32') {
          exec(`start "${url}"`);
        } else {
          exec(`xdg-open "${url}"`);
        }
      };

      open(authUrl).catch(() => {
        // Silently fail if browser can't be opened
      });
    });

    server.on('error', (error) => {
      reject(new Error(`Failed to start OAuth server: ${error.message}`));
    });

    // Timeout after 5 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('OAuth timeout - no response received within 5 minutes'));
    }, 5 * 60 * 1000);
  });
}

/**
 * Create an authenticated OAuth2 client from stored credentials
 */
export function createAuthenticatedClient(credentials: Credentials, config: OAuthConfig) {
  const oauth2Client = createOAuth2Client(config);
  oauth2Client.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken,
    expiry_date: credentials.expiryDate,
  });
  return oauth2Client;
}
