import { optional } from '@optique/core/modifiers';
import { option } from '@optique/core/primitives';
import { choice } from '@optique/core/valueparser';
import type { ValueParser, ValueParserResult } from '@optique/core/valueparser';
import type { Suggestion } from '@optique/core/parser';
import { message } from '@optique/core/message';

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
    yield { kind: 'literal', text: 'gdrive', description: message`Google Drive` };
    yield { kind: 'literal', text: 'linear', description: message`Linear` };
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
    // gdrive types
    yield { kind: 'literal', text: 'file', description: message`Any file (gdrive)` };
    yield { kind: 'literal', text: 'folder', description: message`Folders (gdrive)` };
    yield { kind: 'literal', text: 'document', description: message`Google Docs` };
    yield { kind: 'literal', text: 'spreadsheet', description: message`Google Sheets` };
    yield { kind: 'literal', text: 'presentation', description: message`Google Slides` };
    // linear types
    yield { kind: 'literal', text: 'issue', description: message`Linear issues` };
    yield { kind: 'literal', text: 'project', description: message`Linear projects` };
    yield { kind: 'literal', text: 'cycle', description: message`Linear cycles` };
  },
};

// Output format choice
export const outputFormat = choice(['text', 'json'] as const);

// Common output option
export const outputOption = optional(option('-o', '--output', outputFormat, { description: message`Output format (text, json)` }));
