import {Batch} from "@max/core";

/**
 * Fake API client interface for testing.
 */
export interface AcmeApiClient {
  root: {
    listTeams(opts: { cursor?: string; limit?: number }): Promise<{
      teams: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor?: string;
    }>;
  };
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

export class AcmeApiClientStub implements AcmeApiClient {
  private _users: Map<string, User>;
  private _teams: Map<string, Team>;
  private _memberships: Map<string, string[]>; // teamId -> userId[]

  constructor(opts: { users: number; teams: number }) {
    this._users = new Map();
    this._teams = new Map();
    this._memberships = new Map();

    for (let i = 1; i <= opts.users; i++) {
      const id = `user-${i}`;
      this._users.set(id, { id, name: `User "${i}"`, email: `user${i}@acme.com`, age: 20 + (i % 40) });
    }

    for (let i = 1; i <= opts.teams; i++) {
      const id = `team-${i}`;
      const ownerId = `user-${((i - 1) % opts.users) + 1}`;
      this._teams.set(id, { id, name: `Team "${i}"`, description: `Description for team ${i}`, ownerId });
      this._memberships.set(id, []);
    }

    // Distribute users evenly across teams
    if (opts.teams > 0) {
      for (let i = 1; i <= opts.users; i++) {
        const teamIndex = ((i - 1) % opts.teams) + 1;
        const teamId = `team-${teamIndex}`;
        this._memberships.get(teamId)!.push(`user-${i}`);
      }
    }
  }

  root = {
    listTeams: async (opts: { cursor?: string; limit?: number }): Promise<{
      teams: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor?: string;
    }> => {
      const allTeamIds = Array.from(this._teams.keys());
      const limit = opts.limit ?? 100;
      const startIndex = opts.cursor ? parseInt(opts.cursor, 10) : 0;
      const slice = allTeamIds.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < allTeamIds.length;

      return {
        teams: slice.map(id => ({ id })),
        hasMore,
        nextCursor: hasMore ? String(startIndex + limit) : undefined,
      };
    },
  };

  users = {
    get: async (id: string): Promise<User> => {
      const user = this._users.get(id);
      if (!user) throw new Error(`User not found: ${id}`);
      return user;
    },
    getBatch: async (ids: string[]): Promise<Array<User>> => {
      return ids.map(id => {
        const user = this._users.get(id);
        if (!user) throw new Error(`User not found: ${id}`);
        return user;
      });
    },
  };

  teams = {
    get: async (id: string): Promise<Team> => {
      const team = this._teams.get(id);
      if (!team) throw new Error(`Team not found: ${id}`);
      return team;
    },
    listMembers: async (teamId: string, opts: { cursor?: string; limit?: number }): Promise<{
      members: Array<{ userId: string }>;
      hasMore: boolean;
      nextCursor?: string;
    }> => {
      const allMembers = this._memberships.get(teamId);
      if (!allMembers) throw new Error(`Team not found: ${teamId}`);

      const limit = opts.limit ?? 10;
      const startIndex = opts.cursor ? parseInt(opts.cursor, 10) : 0;
      const slice = allMembers.slice(startIndex, startIndex + limit);
      const hasMore = startIndex + limit < allMembers.length;

      return {
        members: slice.map(userId => ({ userId })),
        hasMore,
        nextCursor: hasMore ? String(startIndex + limit) : undefined,
      };
    },
  };
}

type User = { id: string; name: string; email: string; age: number }
type Team = { id: string; name: string; description: string; ownerId: string }
