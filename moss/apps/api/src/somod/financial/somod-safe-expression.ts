/**
 * Restricted arithmetic expression evaluator — no Function/eval/globals.
 * Allow-list: numbers, approved variable names, + - * / ( ) and unary minus.
 */

const FORBIDDEN = [
  'eval',
  'function',
  'constructor',
  'prototype',
  '__proto__',
  'global',
  'globalthis',
  'process',
  'require',
  'import',
  'window',
  'self',
  'this',
];

type Tok =
  | { t: 'num'; v: number }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lp' }
  | { t: 'rp' };

function tokenize(expr: string): Tok[] {
  const s = expr.replace(/\s+/g, '');
  const out: Tok[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (/[0-9.]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[0-9.]/.test(s[j])) j += 1;
      const raw = s.slice(i, j);
      if (!/^\d+(\.\d+)?$/.test(raw)) throw new Error(`Invalid number: ${raw}`);
      out.push({ t: 'num', v: Number(raw) });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[a-zA-Z0-9_]/.test(s[j])) j += 1;
      out.push({ t: 'id', v: s.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/'.includes(c)) {
      out.push({ t: 'op', v: c });
      i += 1;
      continue;
    }
    if (c === '(') {
      out.push({ t: 'lp' });
      i += 1;
      continue;
    }
    if (c === ')') {
      out.push({ t: 'rp' });
      i += 1;
      continue;
    }
    throw new Error(`Disallowed character in formula: ${c}`);
  }
  return out;
}

class Parser {
  private i = 0;
  constructor(
    private readonly toks: Tok[],
    private readonly ctx: Record<string, number>,
  ) {}

  private peek() {
    return this.toks[this.i];
  }
  private next() {
    return this.toks[this.i++];
  }

  parse(): number {
    const v = this.expr();
    if (this.i < this.toks.length) throw new Error('Unexpected trailing tokens in formula');
    return v;
  }

  private expr(): number {
    let v = this.term();
    while (this.peek()?.t === 'op' && (this.peek() as { v: string }).v && '+-'.includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      const r = this.term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  private term(): number {
    let v = this.unary();
    while (this.peek()?.t === 'op' && (this.peek() as { v: string }).v && '*/'.includes((this.peek() as { v: string }).v)) {
      const op = (this.next() as { v: string }).v;
      const r = this.unary();
      if (op === '/') {
        if (r === 0) throw new Error('Division by zero in formula');
        v = v / r;
      } else v = v * r;
    }
    return v;
  }

  private unary(): number {
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '-') {
      this.next();
      return -this.unary();
    }
    if (this.peek()?.t === 'op' && (this.peek() as { v: string }).v === '+') {
      this.next();
      return this.unary();
    }
    return this.primary();
  }

  private primary(): number {
    const tok = this.peek();
    if (!tok) throw new Error('Unexpected end of formula');
    if (tok.t === 'num') {
      this.next();
      return tok.v;
    }
    if (tok.t === 'id') {
      this.next();
      const key = tok.v;
      const lower = key.toLowerCase();
      if (FORBIDDEN.includes(lower)) throw new Error(`Forbidden identifier: ${key}`);
      if (!(key in this.ctx)) throw new Error(`Unknown identifier in governed formula: ${key}`);
      const n = this.ctx[key];
      if (!Number.isFinite(n)) throw new Error(`Non-finite variable: ${key}`);
      return n;
    }
    if (tok.t === 'lp') {
      this.next();
      const v = this.expr();
      if (this.peek()?.t !== 'rp') throw new Error('Missing closing parenthesis');
      this.next();
      return v;
    }
    throw new Error('Unexpected token in formula');
  }
}

export function evaluateSafeExpression(
  expression: string,
  context: Record<string, number>,
): number {
  const expr = String(expression || '').trim();
  if (!expr) return 0;
  if (expr.length > 500) throw new Error('Formula too long');
  const lower = expr.toLowerCase();
  for (const bad of FORBIDDEN) {
    if (lower.includes(bad)) throw new Error(`Forbidden token in formula: ${bad}`);
  }
  if (/[\[\]{};`"'$\\]/.test(expr)) throw new Error('Disallowed characters in formula');
  const toks = tokenize(expr);
  const value = new Parser(toks, context).parse();
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value * 100) / 100);
}
