/**
 * CredentialProvider — Batteries-included credential access for connectors.
 *
 * Wraps a CredentialStore and adds:
 * - Typed credential handles via .get()
 * - OAuth access token caching + lazy refresh
 * - Refresh token rotation
 * - Scheduled proactive refresh via startRefreshSchedulers()
 */

import { StaticTypeCompanion } from "@max/core";
import type { CredentialStore } from "./credential-store.js";
import type {
  StringCredential,
  OAuthAccessRef,
  OAuthCredential,
  CredentialRef,
} from "./credential.js";
import { ErrOAuthNotRegistered, ErrUnknownCredentialRef } from "./errors.js";

// ============================================================================
// CredentialHandle
// ============================================================================

export interface CredentialHandle<T> {
  /** Get the current valid value */
  get(): Promise<T>;
}

// ============================================================================
// CredentialProvider Interface
// ============================================================================

export interface CredentialProvider {
  get(ref: StringCredential): CredentialHandle<string>;
  get(ref: OAuthAccessRef): CredentialHandle<string>;
  get(ref: CredentialRef): CredentialHandle<string>;

  /** Start proactive refresh timers for all OAuth credentials */
  startRefreshSchedulers(): void;

  /** Stop all refresh timers */
  stopRefreshSchedulers(): void;
}

// ============================================================================
// CredentialProvider Implementation
// ============================================================================

interface CachedToken {
  value: string;
  expiresAt: number;
}

class CredentialProviderImpl implements CredentialProvider {
  /** Maps access token name → OAuthCredential for lookup from refs */
  private oauthByAccessName: Map<string, OAuthCredential>;
  private tokenCache = new Map<string, CachedToken>();
  private timers: Timer[] = [];

  constructor(
    private store: CredentialStore,
    oauthCredentials: OAuthCredential[],
  ) {
    this.oauthByAccessName = new Map(
      oauthCredentials.map((o) => [o.accessToken.name, o])
    );
  }

  get(ref: StringCredential): CredentialHandle<string>;
  get(ref: OAuthAccessRef): CredentialHandle<string>;
  get(ref: CredentialRef): CredentialHandle<string> {
    if (ref.kind === "string") {
      return { get: () => this.store.get(ref.name) };
    }

    if (ref.kind === "oauth-access") {
      const oauth = this.oauthByAccessName.get(ref.name);
      if (!oauth) {
        throw ErrOAuthNotRegistered.create({ accessToken: ref.name });
      }
      return { get: () => this.resolveAccessToken(oauth) };
    }

    throw ErrUnknownCredentialRef.create({ kind: (ref as any).kind });
  }

  startRefreshSchedulers(): void {
    this.stopRefreshSchedulers();

    for (const oauth of this.oauthByAccessName.values()) {
      // Refresh at 90% of expiry interval to stay ahead of expiry
      const intervalMs = oauth.expiresIn * 1000 * 0.9;

      const timer = setInterval(async () => {
        try {
          await this.refreshAccessToken(oauth);
        } catch {
          // Refresh failed — retried on next interval or next .get()
        }
      }, intervalMs);

      this.timers.push(timer);
    }
  }

  stopRefreshSchedulers(): void {
    for (const timer of this.timers) {
      clearInterval(timer);
    }
    this.timers = [];
  }

  private async resolveAccessToken(oauth: OAuthCredential): Promise<string> {
    const cached = this.tokenCache.get(oauth.accessToken.name);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }
    return this.refreshAccessToken(oauth);
  }

  private async refreshAccessToken(oauth: OAuthCredential): Promise<string> {
    const refreshToken = await this.store.get(oauth.refreshToken.name);
    const result = await oauth.refresh(refreshToken);

    this.tokenCache.set(oauth.accessToken.name, {
      value: result.accessToken,
      expiresAt: Date.now() + oauth.expiresIn * 1000,
    });

    if (result.refreshToken) {
      await this.store.set(oauth.refreshToken.name, result.refreshToken);
    }

    return result.accessToken;
  }
}

// ============================================================================
// CredentialProvider Static Methods
// ============================================================================

export const CredentialProvider = StaticTypeCompanion({
  create(store: CredentialStore, oauthCredentials?: OAuthCredential[]): CredentialProvider {
    return new CredentialProviderImpl(store, oauthCredentials ?? []);
  },
});
