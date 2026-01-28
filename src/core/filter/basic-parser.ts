/**
 * Basic filter expression parser.
 *
 * Parses filter strings like:
 *   "name=foo"
 *   "name=foo AND state=open"
 *   "(type=bug OR type=feature) AND priority>=2"
 *   "NOT status=closed"
 *
 * Grammar:
 *   expr       := term ((AND | OR) term)*
 *   term       := NOT? factor
 *   factor     := comparison | '(' expr ')'
 *   comparison := column operator value
 *   operator   := '=' | '!=' | '>' | '>=' | '<' | '<=' | '~='
 */

import type { IFilterParser, FilterExpr, FilterOp } from '../../types/filter.js';

const OPERATORS: readonly FilterOp[] = ['!=', '>=', '<=', '>', '<', '~=', '='];
const OP_PATTERN = /^(!=|>=|<=|>|<|~=|=)/;

export class BasicFilterParser implements IFilterParser {
  parse(input: string, columns: string[]): FilterExpr {
    const parser = new Parser(input, columns);
    return parser.parse();
  }
}

class Parser {
  private tokens: string[];
  private pos: number = 0;
  private columns: string[];

  constructor(input: string, columns: string[]) {
    this.tokens = this.tokenize(input);
    this.columns = columns;
  }

  private tokenize(input: string): string[] {
    const tokens: string[] = [];
    let i = 0;

    while (i < input.length) {
      // Skip whitespace
      if (/\s/.test(input[i])) {
        i++;
        continue;
      }

      // Parentheses
      if (input[i] === '(' || input[i] === ')') {
        tokens.push(input[i]);
        i++;
        continue;
      }

      // Quoted string
      if (input[i] === '"' || input[i] === "'") {
        const quote = input[i];
        let value = '';
        i++; // skip opening quote
        while (i < input.length && input[i] !== quote) {
          if (input[i] === '\\' && i + 1 < input.length) {
            // Handle escape sequences
            i++;
            if (input[i] === 'n') {
              value += '\n';
            } else if (input[i] === 't') {
              value += '\t';
            } else {
              value += input[i];
            }
          } else {
            value += input[i];
          }
          i++;
        }
        if (i < input.length) {
          i++; // skip closing quote
        }
        tokens.push(value);
        continue;
      }

      // Word token (including operators attached to column names)
      let token = '';
      while (i < input.length && !/[\s()"]/.test(input[i]) && input[i] !== "'") {
        token += input[i];
        i++;
      }

      if (token) {
        tokens.push(token);
      }
    }

    return tokens;
  }

  private peek(): string | undefined {
    return this.tokens[this.pos];
  }

  private consume(): string {
    const token = this.tokens[this.pos];
    if (token === undefined) {
      throw new Error('Unexpected end of input');
    }
    this.pos++;
    return token;
  }

  private match(...values: string[]): boolean {
    const token = this.peek()?.toUpperCase();
    return token !== undefined && values.includes(token);
  }

  parse(): FilterExpr {
    if (this.tokens.length === 0) {
      throw new Error('Empty filter expression');
    }

    const expr = this.parseExpr();

    if (this.pos < this.tokens.length) {
      throw new Error(`Unexpected token: ${this.peek()}`);
    }

    return expr;
  }

  private parseExpr(): FilterExpr {
    let left = this.parseTerm();

    while (this.match('AND', 'OR')) {
      const opToken = this.consume().toUpperCase();
      const right = this.parseTerm();

      if (opToken === 'AND') {
        left = { type: 'and', left, right };
      } else {
        left = { type: 'or', left, right };
      }
    }

    return left;
  }

  private parseTerm(): FilterExpr {
    if (this.match('NOT')) {
      this.consume();
      const expr = this.parseFactor();
      return { type: 'not', expr };
    }
    return this.parseFactor();
  }

  private parseFactor(): FilterExpr {
    if (this.peek() === '(') {
      this.consume(); // (
      const expr = this.parseExpr();
      if (this.peek() !== ')') {
        throw new Error('Expected closing parenthesis');
      }
      this.consume(); // )
      return expr;
    }
    return this.parseComparison();
  }

  private parseComparison(): FilterExpr {
    const token = this.consume();

    // Try to parse as "column" followed by operator, or "column=value" combined
    for (const col of this.columns) {
      // Case 1: token is exactly the column name
      if (token === col) {
        // Next token should be operator or operator+value
        const next = this.peek();
        if (!next) {
          throw new Error(`Expected operator after column "${col}"`);
        }

        // Check if next token starts with an operator
        const opMatch = next.match(OP_PATTERN);
        if (opMatch) {
          this.consume();
          const op = opMatch[1] as FilterOp;
          const valueAfterOp = next.slice(op.length);

          let value: string;
          if (valueAfterOp) {
            // Operator and value were combined: "=value"
            value = valueAfterOp;
          } else {
            // Value is the next token
            const valueToken = this.peek();
            if (valueToken === undefined) {
              throw new Error(`Expected value after operator "${op}"`);
            }
            value = this.consume();
          }

          return { type: 'comparison', field: col, op, value };
        }

        throw new Error(`Expected operator after column "${col}", got: ${next}`);
      }

      // Case 2: token starts with column name and includes operator
      if (token.startsWith(col) && token.length > col.length) {
        const rest = token.slice(col.length);
        const opMatch = rest.match(OP_PATTERN);

        if (opMatch) {
          const op = opMatch[1] as FilterOp;
          let value = rest.slice(op.length);

          // If no value after operator, check next token
          if (!value) {
            const valueToken = this.peek();
            if (valueToken === undefined) {
              throw new Error(`Expected value after operator "${op}"`);
            }
            value = this.consume();
          }

          return { type: 'comparison', field: col, op, value };
        }
      }
    }

    throw new Error(`Unknown column in filter: "${token}". Valid columns: ${this.columns.join(', ')}`);
  }
}
