import type { Database } from "bun:sqlite";
import type { WebhookDelivery, WebhookPayload, WebhookRegistration } from "./types.ts";

export function registerWebhook(db: Database, url: string): WebhookRegistration {
  const id = `wh_${crypto.randomUUID().replace(/-/g, "")}`;
  const now = new Date().toISOString();
  db.prepare("INSERT INTO webhooks (id, url, created_at, active) VALUES (?, ?, ?, 1)").run(
    id,
    url,
    now,
  );
  return { id, url, createdAt: now, active: true };
}

export function unregisterWebhook(db: Database, id: string): void {
  db.prepare("UPDATE webhooks SET active = 0 WHERE id = ?").run(id);
}

export function listWebhooks(db: Database): WebhookRegistration[] {
  const rows = db
    .prepare("SELECT id, url, created_at, active FROM webhooks WHERE active = 1")
    .all() as any[];
  return rows.map((r) => ({
    id: r.id,
    url: r.url,
    createdAt: r.created_at,
    active: Boolean(r.active),
  }));
}

export function getRecentDeliveries(db: Database, limit: number = 50): WebhookDelivery[] {
  const rows = db
    .prepare(
      `SELECT id, webhook_id, payload, status_code, delivered_at, success
       FROM webhook_deliveries ORDER BY id DESC LIMIT ?`,
    )
    .all(limit) as any[];
  return rows.map((r) => ({
    id: r.id,
    webhookId: r.webhook_id,
    payload: JSON.parse(r.payload),
    statusCode: r.status_code,
    deliveredAt: r.delivered_at,
    success: Boolean(r.success),
  }));
}

export async function dispatchWebhooks(
  db: Database,
  payload: WebhookPayload,
  inProcessCallbacks: Array<(payload: WebhookPayload) => void>,
): Promise<void> {
  // Fire in-process callbacks synchronously
  for (const cb of inProcessCallbacks) {
    try {
      cb(payload);
    } catch {
      // swallow errors from callbacks
    }
  }

  // Fire HTTP webhooks (non-blocking)
  const hooks = listWebhooks(db);
  const now = new Date().toISOString();

  await Promise.allSettled(
    hooks.map(async (hook) => {
      let statusCode: number | null = null;
      let success = false;
      try {
        const res = await fetch(hook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        statusCode = res.status;
        success = res.ok;
      } catch {
        // delivery failed — logged below
      }
      db.prepare(
        `INSERT INTO webhook_deliveries (webhook_id, payload, status_code, delivered_at, success)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(hook.id, JSON.stringify(payload), statusCode, now, success ? 1 : 0);
    }),
  );
}
