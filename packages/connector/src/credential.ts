/**
 * Credential — Typed credential definitions for connectors.
 *
 * `Credential.string(name)` for simple stored secrets (API keys, tokens).
 * `Credential.oauth(opts)` for OAuth access/refresh token pairs with automatic refresh.
 */

import { StaticTypeCompanion } from "@max/core";

// ============================================================================
// String Credential
// ============================================================================

export interface StringCredential {
  readonly kind: "string";
  readonly name: string;
}

// ============================================================================
// OAuth Credential
// ============================================================================

export interface OAuthRefreshResult {
  accessToken: string;
  /** If the provider rotates refresh tokens, return the new one */
  refreshToken?: string;
}

export interface OAuthAccessRef {
  readonly kind: "oauth-access";
  readonly name: string;
}

export interface OAuthRefreshRef {
  readonly kind: "oauth-refresh";
  readonly name: string;
}

export interface OAuthCredential {
  readonly kind: "oauth";
  readonly accessToken: OAuthAccessRef;
  readonly refreshToken: OAuthRefreshRef;
  readonly expiresIn: number;
  readonly refresh: (refreshToken: string) => Promise<OAuthRefreshResult>;
}

// ============================================================================
// Union of things passable to CredentialProvider.get()
// ============================================================================

export type CredentialRef = StringCredential | OAuthAccessRef;

// ============================================================================
// Credential Factory (namespace merge)
// ============================================================================

export const Credential = StaticTypeCompanion({
  /** A simple stored secret (API key, token, etc.) */
  string(name: string): StringCredential {
    return { kind: "string", name };
  },

  /** An OAuth access/refresh token pair with automatic refresh */
  oauth(opts: {
    refreshToken: string;
    accessToken: string;
    expiresIn: number;
    refresh: (refreshToken: string) => Promise<OAuthRefreshResult>;
  }): OAuthCredential {
    return {
      kind: "oauth",
      accessToken: { kind: "oauth-access", name: opts.accessToken },
      refreshToken: { kind: "oauth-refresh", name: opts.refreshToken },
      expiresIn: opts.expiresIn,
      refresh: opts.refresh,
    };
  },
});
