import type { Database } from "bun:sqlite";

export function generateApiKey(): string {
  return `acme_${crypto.randomUUID().replace(/-/g, "")}`;
}

export function storeApiKey(db: Database, key: string): void {
  db.prepare("INSERT INTO api_keys (key, created_at, active) VALUES (?, ?, 1)").run(
    key,
    new Date().toISOString(),
  );
}

export function validateApiKey(db: Database, key: string): boolean {
  const row = db.prepare("SELECT 1 FROM api_keys WHERE key = ? AND active = 1").get(key);
  return row != null;
}

export function getActiveApiKey(db: Database): string | null {
  const row = db
    .prepare("SELECT key FROM api_keys WHERE active = 1 ORDER BY created_at DESC LIMIT 1")
    .get() as any;
  return row?.key ?? null;
}

export function rotateApiKey(db: Database): string {
  db.prepare("UPDATE api_keys SET active = 0").run();
  const key = generateApiKey();
  storeApiKey(db, key);
  return key;
}
