/**
 * AcmeContext - Context definition for Acme connector.
 */

import { Context } from "@max/core";

/**
 * Fake API client interface for testing.
 */
export interface AcmeApiClient {
  users: {
    get(id: string): Promise<User>
    getBatch(ids: string[]): Promise<Array<User>>
  }
  teams: {
    get(id: string): Promise<Team>;
    listMembers(teamId: string, opts: { cursor?: string; limit?: number }): Promise<{
      members: Array<{ userId: string }>;
      hasMore: boolean;
      nextCursor?: string;
    }>;
  };
}
type User = { id: string; name: string; email: string; age: number }
type Team = { id: string; name: string; description: string; ownerId: string }

/**
 * AcmeAppContext - Application-level context for Acme loaders.
 */
export class AcmeAppContext extends Context {
  api = Context.instance<AcmeApiClient>();
  installationId = Context.string;
}
