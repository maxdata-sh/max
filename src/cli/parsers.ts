import {multiple, optional} from '@optique/core/modifiers';
import { option } from '@optique/core/primitives';
import { choice } from '@optique/core/valueparser';
import type { ValueParser, ValueParserResult } from '@optique/core/valueparser';
import type { Suggestion } from '@optique/core/parser';
import { message } from '@optique/core/message';
import {getSources, getAllEntityTypes, getAllFilterableFields, getAllFields} from '../core/schema-registry.js';

// Custom value parser for source argument with completions
export const sourceArg: ValueParser<'sync', string> = {
  $mode: 'sync',
  metavar: 'SOURCE',
  parse(input: string): ValueParserResult<string> {
    return { success: true, value: input };
  },
  format(value: string): string {
    return value;
  },
  *suggest(): Generator<Suggestion> {
    for (const source of getSources()) {
      yield { kind: 'literal', text: source, description: message`${source}` };
    }
  },
};

// Custom value parser for entity type with completions
// Accepts any string - validation happens at query time based on connector schema
export const entityTypeArg: ValueParser<'sync', string> = {
  $mode: 'sync',
  metavar: 'TYPE',
  parse(input: string): ValueParserResult<string> {
    return { success: true, value: input };
  },
  format(value: string): string {
    return value;
  },
  *suggest(): Generator<Suggestion> {
    for (const { source, type } of getAllEntityTypes()) {
      yield { kind: 'literal', text: type, description: message`${type} (${source})` };
    }
  },
};

// Output format choices
export const outputFormat = choice(['text', 'json'] as const);
export const outputFormatWithNdjson = choice(['text', 'json', 'ndjson'] as const);

// Common output option (text, json only)
export const outputOption = optional(option('-o', '--output', outputFormat, { description: message`Output format (text, json)` }));

// Output option with ndjson support (for search command)
export const outputOptionWithNdjson = optional(option('-o', '--output', outputFormatWithNdjson, { description: message`Output format (text, json, ndjson)` }));

// Field selection value parser with completions (supports comma-separated values)
export const fieldsArg: ValueParser<'sync', string[]> = {
  $mode: 'sync',
  metavar: 'FIELD[,FIELD...]',
  parse(input: string): ValueParserResult<string[]> {
    if (!input) {
      return { success: false, error: message`Field name cannot be empty` };
    }
    const fields = input.split(',').map(f => f.trim()).filter(f => f);
    if (fields.length === 0) {
      return { success: false, error: message`Field name cannot be empty` };
    }
    return { success: true, value: fields };
  },
  format(value: string[]): string {
    return value.join(',');
  },
  *suggest(): Generator<Suggestion> {
    for (const { source, field } of getAllFields()) {
      const desc = field.description ? `${field.description} (${source})` : `${source}`;
      yield { kind: 'literal', text: field.name, description: message`${desc}` };
    }
  },
};

// Common fields option (repeatable, supports comma-separated values)
export const fieldsOption = multiple(option('--fields', fieldsArg, { description: message`Fields to include (comma-separated or repeatable)` }));
