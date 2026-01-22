import { google } from 'googleapis';
import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import type { Credentials } from '../../types/connector.js';
import type { ConfigManager } from '../../core/config-manager.js';

const SCOPES = [
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
];

const REDIRECT_PORT = 3847;
// Desktop OAuth apps require 127.0.0.1 (IP), not localhost (hostname)
const REDIRECT_URI = `http://127.0.0.1:${REDIRECT_PORT}/oauth2callback`;

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
}

/**
 * Get path to OAuth client credentials file
 */
function getOAuthConfigPath(config: ConfigManager): string {
  return path.join(config.getCredentialsDir(), 'gdrive-oauth.json');
}

/**
 * Load OAuth config from stored file
 */
export function loadStoredOAuthConfig(config: ConfigManager): OAuthConfig | null {
  const configPath = getOAuthConfigPath(config);
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const content = fs.readFileSync(configPath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed.clientId && parsed.clientSecret) {
      return parsed as OAuthConfig;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Save OAuth config to file
 */
export function saveOAuthConfig(config: ConfigManager, oauthConfig: OAuthConfig): void {
  const configPath = getOAuthConfigPath(config);
  fs.writeFileSync(configPath, JSON.stringify(oauthConfig, null, 2));
}

/**
 * Prompt user for OAuth credentials
 */
export async function promptForOAuthConfig(): Promise<OAuthConfig> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const question = (prompt: string): Promise<string> => {
    return new Promise((resolve) => {
      rl.question(prompt, (answer) => {
        resolve(answer.trim());
      });
    });
  };

  console.log('\nGoogle OAuth credentials not found.\n');
  console.log('To set up Google Drive access:');
  console.log('1. Go to https://console.cloud.google.com/apis/credentials');
  console.log('2. Create a new OAuth 2.0 Client ID (Desktop app type)');
  console.log('3. Copy the Client ID and Client Secret\n');

  const clientId = await question('Enter Client ID: ');
  const clientSecret = await question('Enter Client Secret: ');

  rl.close();

  if (!clientId || !clientSecret) {
    throw new Error('Client ID and Client Secret are required.');
  }

  return { clientId, clientSecret };
}

/**
 * Get OAuth configuration - from stored file, env vars, or prompt
 */
export function getOAuthConfig(config?: ConfigManager): OAuthConfig {
  // First try stored config
  if (config) {
    const stored = loadStoredOAuthConfig(config);
    if (stored) {
      return stored;
    }
  }

  // Fall back to environment variables
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  // No credentials available - will need to prompt
  throw new Error('NO_CREDENTIALS');
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
export async function authenticate(configManager?: ConfigManager): Promise<Credentials> {
  let oauthConfig: OAuthConfig;

  try {
    oauthConfig = getOAuthConfig(configManager);
  } catch (error) {
    if (error instanceof Error && error.message === 'NO_CREDENTIALS') {
      // Prompt for credentials
      oauthConfig = await promptForOAuthConfig();
      // Save for future use
      if (configManager) {
        saveOAuthConfig(configManager, oauthConfig);
        console.log('\n✓ Credentials saved to .max/credentials/\n');
      }
    } else {
      throw error;
    }
  }

  const oauth2Client = createOAuth2Client(oauthConfig);

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

    server.listen(REDIRECT_PORT, '127.0.0.1', () => {
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
