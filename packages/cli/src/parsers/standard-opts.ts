import {optional} from '@optique/core/modifiers';
import {option} from '@optique/core/primitives';
import {choice} from '@optique/core/valueparser';
import {message} from '@optique/core/message';


// Output format choices
export const outputFormat = choice(['text', 'json', 'ndjson']);

// Common output option (text, json only)
export const outputOption = optional(option('-o', '--output', outputFormat, { description: message`Output format (text, json, ndjson)` }));
