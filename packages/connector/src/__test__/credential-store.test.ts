import { describe, test, expect } from "bun:test";
import { Credential } from "../credential.js";
import { StubbedCredentialStore } from "../credential-store.js";
import { CredentialProvider } from "../credential-provider.js";

// ============================================================================
// Credential factory
// ============================================================================

describe("Credential", () => {
  test("string creates a string credential", () => {
    const apiToken = Credential.string("api_token");
    expect(apiToken.kind).toBe("string");
    expect(apiToken.name).toBe("api_token");
  });

  test("oauth creates an OAuth credential with refs", () => {
    const auth = Credential.oauth({
      refreshToken: "refresh_token",
      accessToken: "access_token",
      expiresIn: 3500,
      async refresh() { return { accessToken: "t" }; },
    });

    expect(auth.kind).toBe("oauth");
    expect(auth.expiresIn).toBe(3500);
    expect(auth.accessToken).toEqual({ kind: "oauth-access", name: "access_token" });
    expect(auth.refreshToken).toEqual({ kind: "oauth-refresh", name: "refresh_token" });
  });
});

// ============================================================================
// CredentialStore (dumb storage)
// ============================================================================

describe("StubbedCredentialStore", () => {
  test("set and get", async () => {
    const store = new StubbedCredentialStore();
    await store.set("api_token", "sk-123");
    expect(await store.get("api_token")).toBe("sk-123");
  });

  test("pre-populate with initial values", async () => {
    const store = new StubbedCredentialStore({ api_token: "sk-initial" });
    expect(await store.get("api_token")).toBe("sk-initial");
  });

  test("get throws for missing key", async () => {
    const store = new StubbedCredentialStore();
    expect(store.get("nope")).rejects.toThrow('Credential "nope" not found');
  });

  test("has returns true/false", async () => {
    const store = new StubbedCredentialStore({ api_token: "sk-123" });
    expect(await store.has("api_token")).toBe(true);
    expect(await store.has("nope")).toBe(false);
  });

  test("delete removes a credential", async () => {
    const store = new StubbedCredentialStore({ api_token: "sk-123" });
    await store.delete("api_token");
    expect(await store.has("api_token")).toBe(false);
  });

  test("keys lists all names", async () => {
    const store = new StubbedCredentialStore();
    await store.set("a", "1");
    await store.set("b", "2");
    expect(await store.keys()).toEqual(["a", "b"]);
  });
});

// ============================================================================
// CredentialProvider
// ============================================================================

describe("CredentialProvider", () => {
  const ApiToken = Credential.string("api_token");

  describe("string credentials", () => {
    test("get returns a handle that reads from store", async () => {
      const store = new StubbedCredentialStore({ api_token: "sk-123" });
      const provider = CredentialProvider.create(store);

      const handle = provider.get(ApiToken);
      expect(await handle.get()).toBe("sk-123");
    });

    test("handle reflects store changes", async () => {
      const store = new StubbedCredentialStore({ api_token: "old" });
      const provider = CredentialProvider.create(store);
      const handle = provider.get(ApiToken);

      await store.set("api_token", "new");
      expect(await handle.get()).toBe("new");
    });
  });

  describe("OAuth credentials", () => {
    test("get calls refresh and returns access token", async () => {
      const store = new StubbedCredentialStore({ refresh_token: "rt-123" });
      const auth = Credential.oauth({
        refreshToken: "refresh_token",
        accessToken: "access_token",
        expiresIn: 3500,
        async refresh(rt) {
          return { accessToken: `access-from-${rt}` };
        },
      });

      const provider = CredentialProvider.create(store, [auth]);
      const handle = provider.get(auth.accessToken);
      expect(await handle.get()).toBe("access-from-rt-123");
    });

    test("caches access token within TTL", async () => {
      let callCount = 0;
      const store = new StubbedCredentialStore({ refresh_token: "rt" });
      const auth = Credential.oauth({
        refreshToken: "refresh_token",
        accessToken: "access_token",
        expiresIn: 3500,
        async refresh() {
          callCount++;
          return { accessToken: `token-${callCount}` };
        },
      });

      const provider = CredentialProvider.create(store, [auth]);
      const handle = provider.get(auth.accessToken);

      expect(await handle.get()).toBe("token-1");
      expect(await handle.get()).toBe("token-1");
      expect(callCount).toBe(1);
    });

    test("re-refreshes after TTL expires", async () => {
      let callCount = 0;
      const realNow = Date.now;
      const store = new StubbedCredentialStore({ refresh_token: "rt" });
      const auth = Credential.oauth({
        refreshToken: "refresh_token",
        accessToken: "access_token",
        expiresIn: 1,
        async refresh() {
          callCount++;
          return { accessToken: `token-${callCount}` };
        },
      });

      const provider = CredentialProvider.create(store, [auth]);
      const handle = provider.get(auth.accessToken);

      expect(await handle.get()).toBe("token-1");

      // Advance past expiry
      Date.now = () => realNow() + 2000;
      expect(await handle.get()).toBe("token-2");
      expect(callCount).toBe(2);

      Date.now = realNow;
    });

    test("persists rotated refresh token", async () => {
      const store = new StubbedCredentialStore({ refresh_token: "rt-old" });
      const auth = Credential.oauth({
        refreshToken: "refresh_token",
        accessToken: "access_token",
        expiresIn: 3500,
        async refresh() {
          return { accessToken: "at-new", refreshToken: "rt-new" };
        },
      });

      const provider = CredentialProvider.create(store, [auth]);
      await provider.get(auth.accessToken).get();

      expect(await store.get("refresh_token")).toBe("rt-new");
    });

    test("throws for unregistered OAuth ref", () => {
      const store = new StubbedCredentialStore();
      const auth = Credential.oauth({
        refreshToken: "rt",
        accessToken: "at",
        expiresIn: 3500,
        async refresh() { return { accessToken: "t" }; },
      });

      const provider = CredentialProvider.create(store); // no OAuth registered
      expect(() => provider.get(auth.accessToken)).toThrow(
        'No OAuth credential registered for access token "at"'
      );
    });
  });

  describe("refresh schedulers", () => {
    test("stopRefreshSchedulers cleans up timers", () => {
      const store = new StubbedCredentialStore({ refresh_token: "rt" });
      const auth = Credential.oauth({
        refreshToken: "refresh_token",
        accessToken: "access_token",
        expiresIn: 3500,
        async refresh() { return { accessToken: "t" }; },
      });

      const provider = CredentialProvider.create(store, [auth]);
      provider.startRefreshSchedulers();
      // Should not throw
      provider.stopRefreshSchedulers();
    });
  });
});
