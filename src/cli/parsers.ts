import { optional } from '@optique/core/modifiers';
import { option } from '@optique/core/primitives';
import { choice } from '@optique/core/valueparser';
import type { ValueParser, ValueParserResult } from '@optique/core/valueparser';
import type { Suggestion } from '@optique/core/parser';
import { message } from '@optique/core/message';
import { getSources, getAllEntityTypes } from '../core/schema-registry.js';

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

// Output format choice
export const outputFormat = choice(['text', 'json'] as const);

// Common output option
export const outputOption = optional(option('-o', '--output', outputFormat, { description: message`Output format (text, json)` }));
