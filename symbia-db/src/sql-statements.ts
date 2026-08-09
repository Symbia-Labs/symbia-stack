/**
 * Split a SQL script into executable statements.
 *
 * WHY THIS EXISTS, and it is not hypothetical.
 *
 * `identity` and `logging` both applied their schema with
 * `schemaSql.split(";")`. On 8 Aug 2026 someone added an explanatory comment
 * to the identity schema:
 *
 *   -- declared these since the OAuth work landed; this CREATE TABLE, which is
 *   -- what actually builds the table, stopped at created_at.
 *
 * The semicolon in that comment cut the surrounding `CREATE TABLE` in half.
 * Postgres received an unterminated statement and answered
 * `syntax error at end of input` (42601) with a character position and no
 * other clue. Identity failed to boot, and because everything depends on
 * identity, the whole stack failed to start.
 *
 * A comment written to document a past defect caused a worse one. The comment
 * was not wrong — a naive split was.
 *
 * WHAT THIS RESPECTS, all of which a `.split(";")` does not:
 *
 *   -- line comments        a semicolon here ends nothing
 *   /* block comments *​/    including nested-looking content
 *   'string literals'       with '' escaping
 *   "quoted identifiers"    with "" escaping
 *   $tag$ dollar quotes $tag$   function bodies, where semicolons are normal
 *
 * Comments are preserved in the emitted statements rather than stripped:
 * Postgres accepts them, and they are frequently the only explanation of why
 * a column exists. Removing them to make parsing easier would trade the
 * codebase's memory for the parser's convenience.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = sql[i + 1];

    // -- line comment: consume to end of line
    if (ch === '-' && next === '-') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end + 1;
      current += sql.slice(i, stop);
      i = stop;
      continue;
    }

    // /* block comment */ — Postgres allows nesting, so track depth
    if (ch === '/' && next === '*') {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') {
          depth++;
          j += 2;
        } else if (sql[j] === '*' && sql[j + 1] === '/') {
          depth--;
          j += 2;
        } else {
          j++;
        }
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // 'string literal' or "quoted identifier" — doubling the quote escapes it
    if (ch === "'" || ch === '"') {
      const quote = ch;
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === quote) {
          if (sql[j + 1] === quote) {
            j += 2;
            continue;
          }
          j++;
          break;
        }
        j++;
      }
      current += sql.slice(i, j);
      i = j;
      continue;
    }

    // $tag$ dollar-quoted string — the usual home of function bodies, which
    // are full of semicolons that must not split anything
    if (ch === '$') {
      const tag = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
      if (tag) {
        const marker = tag[0];
        const close = sql.indexOf(marker, i + marker.length);
        const stop = close === -1 ? sql.length : close + marker.length;
        current += sql.slice(i, stop);
        i = stop;
        continue;
      }
    }

    if (ch === ';') {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i++;
      continue;
    }

    current += ch;
    i++;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);

  // A fragment that is nothing but comments and whitespace is not a statement.
  // Postgres rejects an empty query, and a trailing explanatory comment after
  // the last semicolon is common and harmless.
  return statements.filter((s) => stripComments(s).trim().length > 0);
}

function stripComments(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ');
}
