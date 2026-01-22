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
  },
};

// Custom value parser for entity type with completions
export const entityTypeArg: ValueParser<'sync', string> = {
  $mode: 'sync',
  metavar: 'TYPE',
  parse(input: string): ValueParserResult<string> {
    const valid = ['file', 'folder', 'document', 'spreadsheet', 'presentation'];
    if (valid.includes(input)) {
      return { success: true, value: input };
    }
    return { success: false, error: message`Invalid type: ${input}. Valid: ${valid.join(', ')}` };
  },
  format(value: string): string {
    return value;
  },
  *suggest(): Generator<Suggestion> {
    yield { kind: 'literal', text: 'file', description: message`Any file` };
    yield { kind: 'literal', text: 'folder', description: message`Folders` };
    yield { kind: 'literal', text: 'document', description: message`Google Docs` };
    yield { kind: 'literal', text: 'spreadsheet', description: message`Google Sheets` };
    yield { kind: 'literal', text: 'presentation', description: message`Google Slides` };
  },
};

// Output format choice
export const outputFormat = choice(['text', 'json'] as const);

// Common output option
export const outputOption = optional(option('-o', '--output', outputFormat, { description: message`Output format (text, json)` }));
