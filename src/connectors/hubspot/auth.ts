import * as readline from 'readline';

const HUBSPOT_API = 'https://api.hubapi.com';

/**
 * Prompt user for HubSpot API key
 */
export async function promptForApiKey(): Promise<string> {
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

  console.log('\nHubSpot API key not found.\n');
  console.log('To get your API key:');
  console.log('1. Go to https://app.hubspot.com/settings → Integrations → Private Apps');
  console.log('2. Click "Create a private app"');
  console.log('3. Give it a name (e.g., "max") and select these scopes:');
  console.log('   - crm.objects.contacts.read');
  console.log('   - crm.objects.companies.read');
  console.log('   - crm.objects.deals.read');
  console.log('   - crm.objects.owners.read');
  console.log('4. Create the app and copy the access token\n');

  const apiKey = await question('Enter your HubSpot access token: ');
  rl.close();

  if (!apiKey) {
    throw new Error('Access token is required.');
  }

  return apiKey;
}

/**
 * Validate API key by making a test request
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch(`${HUBSPOT_API}/crm/v3/objects/contacts?limit=1`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}
