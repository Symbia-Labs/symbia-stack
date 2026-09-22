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
export declare function splitSqlStatements(sql: string): string[];
