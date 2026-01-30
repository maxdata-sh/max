import * as fs from 'node:fs';
import type { StoredEntity } from '../types/entity.js';
import type { EntityFormatter } from '../types/connector.js';
import { flattenEntity, pickFields, type PaginationInfo } from './output.js';

/**
 * Options for creating a printer.
 */
export interface PrinterOptions {
  /** Fields to include in output. If empty, uses formatter's defaultFields. */
  fields?: readonly string[];
  /** Pagination info for the result set. */
  pagination?: PaginationInfo;
  /** Formatter provided by the connector for transforming field values. */
  formatter?: EntityFormatter;
  /** For ndjson: write metadata to stdout as last line instead of FD 3. */
  mergedStream?: boolean;
}

/**
 * Abstract printer interface for outputting search results.
 * Implementations handle different output formats (text, json, ndjson).
 */
export interface Printer {
  /** Print a single entity. */
  printEntity(entity: StoredEntity): void;
  /** Print all entities. */
  printEntities(entities: StoredEntity[]): void;
  /** Print metadata (pagination info). Called after all entities. */
  printMetadata(): void;
  /** Print a notice message (e.g., filtered results count). */
  printNotice(message: string): void;
}

/**
 * Get the fields to display for an entity.
 * Uses explicit fields if provided, otherwise falls back to formatter's defaults.
 */
function getDisplayFields(options: PrinterOptions): readonly string[] | undefined {
  if (options.fields && options.fields.length > 0) {
    return options.fields;
  }
  return options.formatter?.defaultFields;
}

/**
 * Apply formatter transforms to a value.
 */
function transformValue(
  key: string,
  value: unknown,
  entity: StoredEntity,
  formatter?: EntityFormatter
): unknown {
  const transform = formatter?.transforms?.[key];
  if (transform) {
    return transform(value, entity);
  }
  return value;
}

/**
 * Prepare an entity for output by flattening, picking fields, and applying transforms.
 */
function prepareEntity(
  entity: StoredEntity,
  fields: readonly string[] | undefined,
  formatter?: EntityFormatter
): Record<string, unknown> {
  const flattened = flattenEntity(entity);
  const picked = fields && fields.length > 0 ? pickFields(flattened, fields) : flattened;

  // Apply transforms
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(picked)) {
    result[key] = transformValue(key, value, entity, formatter);
  }
  return result;
}

/**
 * Text format printer.
 * Outputs human-readable formatted text.
 */
export class TextPrinter implements Printer {
  private entityCount = 0;
  private headerPrinted = false;

  constructor(private options: PrinterOptions) {}

  printEntity(entity: StoredEntity): void {
    if (!this.headerPrinted) {
      this.printHeader();
      this.headerPrinted = true;
    }

    const fields = getDisplayFields(this.options);
    const prepared = prepareEntity(entity, fields, this.options.formatter);
    this.printKeyValue(prepared);
    this.entityCount++;
  }

  private printKeyValue(obj: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(obj)) {
      if (value !== '' && value !== null && value !== undefined) {
        process.stdout.write(`${key}: ${value}\n`);
      }
    }
    process.stdout.write('\n');
  }

  printEntities(entities: StoredEntity[]): void {
    if (entities.length === 0) {
      process.stdout.write('No results found.\n');
      return;
    }

    for (const entity of entities) {
      this.printEntity(entity);
    }
  }

  printMetadata(): void {
    // Text format includes pagination in header, nothing to do here
  }

  printNotice(message: string): void {
    process.stdout.write(`(${message})\n`);
  }

  private printHeader(): void {
    const { pagination } = this.options;
    if (pagination) {
      const start = pagination.offset + 1;
      const end = pagination.offset + pagination.limit;
      const endCapped = Math.min(end, pagination.total);
      process.stdout.write(`Results ${start}-${endCapped} of ${pagination.total}\n\n`);
    }
  }
}

/**
 * JSON format printer.
 * Outputs a single JSON object with pagination and data array.
 */
export class JsonPrinter implements Printer {
  private entities: Record<string, unknown>[] = [];

  constructor(private options: PrinterOptions) {}

  printEntity(entity: StoredEntity): void {
    const fields = getDisplayFields(this.options);
    this.entities.push(prepareEntity(entity, fields, this.options.formatter));
  }

  printEntities(entities: StoredEntity[]): void {
    for (const entity of entities) {
      this.printEntity(entity);
    }
  }

  printMetadata(): void {
    const { pagination } = this.options;

    const response = {
      pagination: pagination
        ? {
            offset: pagination.offset,
            limit: pagination.limit,
            total: pagination.total,
            hasMore: pagination.offset + this.entities.length < pagination.total,
          }
        : null,
      data: this.entities,
    };

    process.stdout.write(JSON.stringify(response, null, 2));
  }

  printNotice(_message: string): void {
    // JSON format doesn't include notices in output
  }
}

/**
 * NDJSON format printer.
 * Outputs one JSON object per line, with metadata on FD 3 or as last line.
 */
export class NdjsonPrinter implements Printer {
  private entityCount = 0;

  constructor(private options: PrinterOptions) {}

  printEntity(entity: StoredEntity): void {
    const fields = getDisplayFields(this.options);
    const prepared = prepareEntity(entity, fields, this.options.formatter);
    process.stdout.write(JSON.stringify(prepared) + '\n');
    this.entityCount++;
  }

  printEntities(entities: StoredEntity[]): void {
    for (const entity of entities) {
      this.printEntity(entity);
    }
  }

  printMetadata(): void {
    const { pagination, mergedStream } = this.options;

    const meta = {
      _meta: {
        pagination: pagination
          ? {
              offset: pagination.offset,
              limit: pagination.limit,
              total: pagination.total,
              hasMore: pagination.offset + this.entityCount < pagination.total,
            }
          : null,
      },
    };

    if (mergedStream) {
      // Write metadata as last line to stdout
      process.stdout.write(JSON.stringify(meta) + '\n');
    } else {
      // Write metadata to FD 3 (silently skip if not available)
      this.tryWriteToFd3(JSON.stringify(meta));
    }
  }

  printNotice(message: string): void {
    // Write to stderr so it doesn't interfere with data stream
    process.stderr.write(`(${message})\n`);
  }

  private tryWriteToFd3(data: string): boolean {
    try {
      fs.writeSync(3, data + '\n');
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * Create a printer for the specified output format.
 */
export function createPrinter(
  format: 'text' | 'json' | 'ndjson',
  options: PrinterOptions
): Printer {
  switch (format) {
    case 'text':
      return new TextPrinter(options);
    case 'json':
      return new JsonPrinter(options);
    case 'ndjson':
      return new NdjsonPrinter(options);
  }
}
