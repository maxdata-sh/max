import * as readline from 'readline';

/**
 * Prompt user for Linear API key
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

  console.log('\nLinear API key not found.\n');
  console.log('To get your API key:');
  console.log('1. Go to https://linear.app/settings/api');
  console.log('2. Click "Create key"');
  console.log('3. Give it a name (e.g., "max") and copy the key\n');

  const apiKey = await question('Enter your Linear API key: ');
  rl.close();

  if (!apiKey) {
    throw new Error('API key is required.');
  }

  return apiKey;
}

/**
 * Validate API key by making a test request
 */
export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.linear.app/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey,
      },
      body: JSON.stringify({
        query: '{ viewer { id } }',
      }),
    });

    if (!response.ok) {
      return false;
    }

    const data = await response.json() as { data?: { viewer?: { id: string } } };
    return !!data.data?.viewer?.id;
  } catch {
    return false;
  }
}
