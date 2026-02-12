/**
 * Filesystem-backed CredentialStore implementation.
 *
 * Reads and writes a flat JSON file of key-value pairs.
 * No encryption for MVP.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { CredentialStore } from "@max/connector";
import { ErrCredentialNotFound } from "@max/connector";

export class FsCredentialStore implements CredentialStore {
  constructor(private readonly filePath: string) {}

  async get(name: string): Promise<string> {
    const data = this.read();
    if (!(name in data)) {
      throw ErrCredentialNotFound.create({ credential: name });
    }
    return data[name];
  }

  async set(name: string, value: string): Promise<void> {
    const data = this.read();
    data[name] = value;
    this.write(data);
  }

  async has(name: string): Promise<boolean> {
    const data = this.read();
    return name in data;
  }

  async delete(name: string): Promise<void> {
    const data = this.read();
    delete data[name];
    this.write(data);
  }

  async keys(): Promise<string[]> {
    return Object.keys(this.read());
  }

  private read(): Record<string, string> {
    if (!fs.existsSync(this.filePath)) return {};
    return JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
  }

  private write(data: Record<string, string>): void {
    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2));
  }
}
