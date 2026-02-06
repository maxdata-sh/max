/**
 * AcmeContext - Context definition for Acme connector.
 */

import { ContextDef, t } from "@max/core";

/**
 * Fake API client interface for testing.
 */
export interface AcmeApiClient {
  users: {
    get(id: string): Promise<{ id: string; name: string; email: string; age: number }>;
    getBatch(ids: string[]): Promise<Array<{ id: string; name: string; email: string }>>;
  };
  teams: {
    get(id: string): Promise<{ id: string; name: string; description: string; ownerId: string }>;
    listMembers(teamId: string, opts: { cursor?: string; limit?: number }): Promise<{
      members: Array<{ userId: string }>;
      hasMore: boolean;
      nextCursor?: string;
    }>;
  };
}

/**
 * AcmeContext - Type-safe context for Acme loaders.
 */
export const AcmeContext = ContextDef.create({
  api: t.instance<AcmeApiClient>(),
  installationId: t.string(),
});

export type AcmeContext = ContextDef.Infer<typeof AcmeContext>;
