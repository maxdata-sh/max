/**
 * AcmeClient — Connector-owned wrapper around the raw @max/acme HTTP client.
 *
 * Ensures lifecycle is respected: start() must be called before accessing the client.
 */

import { AcmeHttpClient } from "@max/acme";
import type { CredentialHandle } from "@max/connector";
import type { AcmeConfig } from "./config.js";

export class AcmeClient {
  private http: AcmeHttpClient | null = null;

  constructor(
    private readonly config: AcmeConfig,
    private readonly tokenHandle: CredentialHandle<string>,
  ) {}

  /** Resolve credentials and construct the HTTP client. */
  async start(): Promise<void> {
    const token = await this.tokenHandle.get();
    this.http = new AcmeHttpClient({
      baseUrl: this.config.baseUrl,
      apiKey: token,
    });
  }

  /** The underlying HTTP client. Throws if start() hasn't been called. */
  get client(): AcmeHttpClient {
    if (!this.http) {
      throw new Error("AcmeClient not started — call start() first");
    }
    return this.http;
  }

  /** Lightweight health check against the API. */
  async health(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.client.listWorkspaces();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  }
}
