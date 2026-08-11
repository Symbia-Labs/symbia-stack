/**
 * Tool Invoke Action Handler
 *
 * Executes built-in tools like math evaluation, unit conversion, etc.
 * These are deterministic, safe operations that don't require external services.
 */

import { BaseActionHandler } from './base.js';
import type { ActionConfig, ActionResult, ExecutionContext } from '../types.js';
import { interpolate } from '../template.js';
import {
  getAllLoadedAssistants,
  loadedAssistantKey,
} from '../../services/assistant-loader.js';

export interface ToolInvokeParams {
  // Tool name (e.g., "math.evaluate", "convert.units")
  tool: string;

  // Input expression. A STRING — it is run through interpolate(), which calls
  // .replace() on it. Tools that take no input (assistants.list) omit it.
  input?: string;

  // Additional parameters for specific tools
  options?: Record<string, unknown>;

  // Store result in context under this key
  resultKey?: string;
}

/**
 * Strip the politeness off an expression before a strict parser sees it.
 *
 * THE PARSER IS NOT THE BOUNDARY. THE BOUNDARY IS WHERE A PERSON TYPES.
 *
 * `math.evaluate` was handed raw message text, so `what is 2+2?` refused with
 * `Invalid character: ?` while `2+2` computed — recorded as STATUS §6.2 on
 * 6 Aug 2026 and still open on 11 Aug. Delegation made it sharper rather than
 * softer: once routing worked, a user reached the right specialist and *then*
 * got refused on phrasing, which reads as the platform being broken rather
 * than picky.
 *
 * This is deliberately LEXICAL, not clever. It removes a leading phrase from a
 * closed list and trailing punctuation, so whatever survives is a strict
 * SUBSTRING of what the user typed. It cannot invent an operand, reorder a
 * term, or change a number. Anything it does not recognise it leaves alone,
 * and the evaluator refuses exactly as before.
 *
 * Understanding an ambiguous request — "15% tip on $47.50" — is NOT this
 * function's job and must not become it. That is Smart Calculator's, where a
 * model does the interpreting and the provenance envelope says so. The whole
 * point of the pair is that Calculator's answer stands on no model; a fuzzy
 * matcher here would quietly make that false.
 */
const MATH_LEAD_IN =
  /^\s*(?:please\s+)?(?:what(?:'s|s| is| does)|how much(?: is)?|calculate|compute|evaluate|solve|work out)\s+/i;

export function normalizeMathInput(raw: string): string {
  let s = raw.trim();
  s = s.replace(MATH_LEAD_IN, '');
  // Trailing conversational punctuation, and a dangling `=` from "2+2 =".
  s = s.replace(/[\s?!.=]+$/, '');
  // A leading `=`, as typed by anyone who lives in spreadsheets.
  s = s.replace(/^=\s*/, '');
  const stripped = s.trim();
  // Never hand back nothing: if stripping consumed the whole string, the
  // original was the expression and the evaluator should say so about the
  // original, not about an empty string.
  return stripped === '' ? raw.trim() : stripped;
}

/**
 * Safe math expression evaluator
 * Supports: +, -, *, /, ^, **, parentheses, and common functions
 */
class MathEvaluator {
  private static readonly CONSTANTS: Record<string, number> = {
    pi: Math.PI,
    PI: Math.PI,
    e: Math.E,
    E: Math.E,
  };

  private static readonly FUNCTIONS: Record<string, (x: number) => number> = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: Math.asin,
    acos: Math.acos,
    atan: Math.atan,
    log: Math.log,
    log10: Math.log10,
    log2: Math.log2,
    exp: Math.exp,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
  };

  evaluate(expression: string): number {
    // Normalize the expression
    let expr = expression
      .replace(/\s+/g, '')           // Remove whitespace
      .replace(/×/g, '*')            // Replace × with *
      .replace(/÷/g, '/')            // Replace ÷ with /
      .replace(/\*\*/g, '^')         // Normalize ** to ^
      .replace(/[xX](?=\d|[-(])/g, '*'); // Replace x as multiplication (2x2 -> 2*2)

    // Replace constants
    for (const [name, value] of Object.entries(MathEvaluator.CONSTANTS)) {
      expr = expr.replace(new RegExp(`\\b${name}\\b`, 'g'), value.toString());
    }

    return this.parseExpression(expr);
  }

  private parseExpression(expr: string): number {
    const tokens = this.tokenize(expr);
    const result = this.parseAddSub(tokens);

    if (tokens.length > 0) {
      throw new Error(`Unexpected token: ${tokens[0]}`);
    }

    return result;
  }

  private tokenize(expr: string): string[] {
    const tokens: string[] = [];
    let i = 0;

    while (i < expr.length) {
      const char = expr[i];

      // Numbers (including decimals)
      if (/[0-9.]/.test(char)) {
        let num = '';
        while (i < expr.length && /[0-9.]/.test(expr[i])) {
          num += expr[i++];
        }
        tokens.push(num);
        continue;
      }

      // Functions and constants
      if (/[a-zA-Z]/.test(char)) {
        let name = '';
        while (i < expr.length && /[a-zA-Z0-9]/.test(expr[i])) {
          name += expr[i++];
        }
        tokens.push(name);
        continue;
      }

      // Operators and parentheses
      if ('+-*/^()%'.includes(char)) {
        tokens.push(char);
        i++;
        continue;
      }

      throw new Error(`Invalid character: ${char}`);
    }

    return tokens;
  }

  private parseAddSub(tokens: string[]): number {
    let left = this.parseMulDiv(tokens);

    while (tokens.length > 0 && (tokens[0] === '+' || tokens[0] === '-')) {
      const op = tokens.shift()!;
      const right = this.parseMulDiv(tokens);
      left = op === '+' ? left + right : left - right;
    }

    return left;
  }

  private parseMulDiv(tokens: string[]): number {
    let left = this.parsePower(tokens);

    while (tokens.length > 0 && ('*/%'.includes(tokens[0]))) {
      const op = tokens.shift()!;
      const right = this.parsePower(tokens);
      if (op === '*') left = left * right;
      else if (op === '/') left = left / right;
      else if (op === '%') left = left % right;
    }

    return left;
  }

  private parsePower(tokens: string[]): number {
    let base = this.parseUnary(tokens);

    while (tokens.length > 0 && tokens[0] === '^') {
      tokens.shift();
      const exp = this.parseUnary(tokens);
      base = Math.pow(base, exp);
    }

    return base;
  }

  private parseUnary(tokens: string[]): number {
    if (tokens[0] === '-') {
      tokens.shift();
      return -this.parseUnary(tokens);
    }
    if (tokens[0] === '+') {
      tokens.shift();
      return this.parseUnary(tokens);
    }
    return this.parsePrimary(tokens);
  }

  private parsePrimary(tokens: string[]): number {
    if (tokens.length === 0) {
      throw new Error('Unexpected end of expression');
    }

    const token = tokens[0];

    // Parenthesized expression
    if (token === '(') {
      tokens.shift();
      const result = this.parseAddSub(tokens);
      if (tokens[0] !== ')') {
        throw new Error('Missing closing parenthesis');
      }
      tokens.shift();
      return result;
    }

    // Function call
    if (/^[a-zA-Z]/.test(token) && tokens[1] === '(') {
      const funcName = tokens.shift()!.toLowerCase();
      const func = MathEvaluator.FUNCTIONS[funcName];
      if (!func) {
        throw new Error(`Unknown function: ${funcName}`);
      }
      tokens.shift(); // consume '('
      const arg = this.parseAddSub(tokens);
      if (tokens[0] !== ')') {
        throw new Error('Missing closing parenthesis for function');
      }
      tokens.shift(); // consume ')'
      return func(arg);
    }

    // Number
    if (/^[0-9.]/.test(token)) {
      tokens.shift();
      const num = parseFloat(token);
      if (isNaN(num)) {
        throw new Error(`Invalid number: ${token}`);
      }
      return num;
    }

    throw new Error(`Unexpected token: ${token}`);
  }
}

/**
 * Unit conversion tool - returns structured result for templates
 */
class UnitConverter {
  private static readonly CONVERSIONS: Record<string, Record<string, number | string>> = {
    length: {
      m: 1, meter: 1, meters: 1,
      km: 1000, kilometer: 1000, kilometers: 1000,
      cm: 0.01, centimeter: 0.01, centimeters: 0.01,
      mm: 0.001, millimeter: 0.001, millimeters: 0.001,
      mi: 1609.344, mile: 1609.344, miles: 1609.344,
      ft: 0.3048, foot: 0.3048, feet: 0.3048,
      in: 0.0254, inch: 0.0254, inches: 0.0254,
      yd: 0.9144, yard: 0.9144, yards: 0.9144,
    },
    weight: {
      kg: 1, kilogram: 1, kilograms: 1,
      g: 0.001, gram: 0.001, grams: 0.001,
      mg: 0.000001, milligram: 0.000001, milligrams: 0.000001,
      lb: 0.453592, pound: 0.453592, pounds: 0.453592, lbs: 0.453592,
      oz: 0.0283495, ounce: 0.0283495, ounces: 0.0283495,
    },
    volume: {
      l: 1, liter: 1, liters: 1,
      ml: 0.001, milliliter: 0.001, milliliters: 0.001,
      gal: 3.78541, gallon: 3.78541, gallons: 3.78541,
      cup: 0.236588, cups: 0.236588,
    },
    temperature: {
      c: 'celsius', celsius: 'celsius',
      f: 'fahrenheit', fahrenheit: 'fahrenheit',
      k: 'kelvin', kelvin: 'kelvin',
    },
  };

  convert(input: string): { fromValue: number; fromUnit: string; toValue: number; toUnit: string } {
    const match = input.match(/^([\d.]+)\s*(\w+)\s*(?:to|in|as)\s*(\w+)$/i);
    if (!match) {
      throw new Error('Invalid format. Use "10 km to miles"');
    }

    const [, valueStr, fromUnit, toUnit] = match;
    const value = parseFloat(valueStr);
    const from = fromUnit.toLowerCase();
    const to = toUnit.toLowerCase();

    for (const [category, units] of Object.entries(UnitConverter.CONVERSIONS)) {
      if (from in units && to in units) {
        let result: number;
        if (category === 'temperature') {
          result = this.convertTemperature(value, from, to);
        } else {
          const fromBase = units[from] as number;
          const toBase = units[to] as number;
          result = (value * fromBase) / toBase;
        }

        return {
          fromValue: value,
          fromUnit: this.normalizeUnit(from),
          toValue: Math.round(result * 1000) / 1000,
          toUnit: this.normalizeUnit(to),
        };
      }
    }

    throw new Error(`Cannot convert from ${from} to ${to}`);
  }

  private normalizeUnit(unit: string): string {
    const map: Record<string, string> = {
      m: 'm', km: 'km', mi: 'mi', mile: 'mi', miles: 'mi',
      ft: 'ft', foot: 'ft', feet: 'ft',
      kg: 'kg', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
      c: '°C', celsius: '°C', f: '°F', fahrenheit: '°F', k: 'K', kelvin: 'K',
    };
    return map[unit] || unit;
  }

  private convertTemperature(value: number, from: string, to: string): number {
    let celsius = from === 'c' || from === 'celsius' ? value
      : from === 'f' || from === 'fahrenheit' ? (value - 32) * 5 / 9
      : value - 273.15;

    return to === 'c' || to === 'celsius' ? celsius
      : to === 'f' || to === 'fahrenheit' ? celsius * 9 / 5 + 32
      : celsius + 273.15;
  }
}

/**
 * Statistical analysis tool
 */
class StatsAnalyzer {
  analyze(input: string): {
    count: number; sum: number; mean: number; median: number;
    min: number; max: number; range: number; stdDev: number;
  } {
    const numbers = input.split(/[,\s\n]+/)
      .map(s => parseFloat(s.trim()))
      .filter(n => !isNaN(n));

    if (numbers.length === 0) throw new Error('No valid numbers found');

    const count = numbers.length;
    const sum = numbers.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const sorted = [...numbers].sort((a, b) => a - b);
    const median = count % 2 === 0
      ? (sorted[count / 2 - 1] + sorted[count / 2]) / 2
      : sorted[Math.floor(count / 2)];
    const min = sorted[0];
    const max = sorted[count - 1];
    const variance = numbers.reduce((a, n) => a + Math.pow(n - mean, 2), 0) / count;

    const round = (n: number) => Math.round(n * 10000) / 10000;
    return {
      count, sum: round(sum), mean: round(mean), median: round(median),
      min: round(min), max: round(max), range: round(max - min), stdDev: round(Math.sqrt(variance)),
    };
  }
}

/**
 * Simple sandboxed code execution (JavaScript only)
 */
class CodeExecutor {
  execute(code: string, config?: { timeout?: number }): { output: string; error?: string } {
    try {
      const outputs: string[] = [];
      const safeConsole = {
        log: (...args: unknown[]) => outputs.push(args.map(String).join(' ')),
        error: (...args: unknown[]) => outputs.push('[ERROR] ' + args.map(String).join(' ')),
      };

      const fn = new Function('console', 'Math', 'JSON', 'Date', 'Array', 'Object', 'String', 'Number',
        '"use strict";\n' + code);
      const result = fn(safeConsole, Math, JSON, Date, Array, Object, String, Number);

      if (result !== undefined) outputs.push(String(result));
      return { output: outputs.join('\n') || '(no output)' };
    } catch (error) {
      return { output: '', error: error instanceof Error ? error.message : 'Execution failed' };
    }
  }
}

export class ToolInvokeHandler extends BaseActionHandler {
  type = 'tool.invoke';

  private mathEvaluator = new MathEvaluator();
  private unitConverter = new UnitConverter();
  private statsAnalyzer = new StatsAnalyzer();
  private codeExecutor = new CodeExecutor();

  async execute(config: ActionConfig, context: ExecutionContext): Promise<ActionResult> {
    const start = Date.now();
    const params = config.params as unknown as ToolInvokeParams;

    try {
      if (!params.tool) {
        return this.failure('No tool specified', Date.now() - start);
      }

      // `input` IS A STRING. SAY SO HERE RATHER THAN CRASHING INSIDE
      // interpolate().
      //
      // interpolate() calls .replace() on what it is given, so an object —
      // which is what the config format looks like it should take, and what
      // every author has reached for — threw `t.replace is not a function`
      // three frames down, and webhooks.ts rendered that string to the person
      // in the chat window. It cost a debugging round on 7 Aug 2026, was
      // written into a commit message as a warning, and then cost another one
      // on 10 Aug because a warning in a commit message is not a guard.
      if (params.input !== undefined && typeof params.input !== 'string') {
        return this.failure(
          `Tool '${params.tool}' was given a ${Array.isArray(params.input) ? 'array' : typeof params.input} for 'input'; it must be a string. ` +
            `Got ${JSON.stringify(params.input).slice(0, 120)}. ` +
            `Tools that take no input should omit the field.`,
          Date.now() - start
        );
      }

      // Interpolate input
      const input = interpolate(params.input || '', context);

      // Execute the appropriate tool
      let result: unknown;

      switch (params.tool) {
        case 'math.evaluate':
          result = this.executeMathEvaluate(input);
          break;

        case 'convert.units':
          result = this.unitConverter.convert(input);
          break;

        case 'stats.analyze':
          result = this.statsAnalyzer.analyze(input);
          break;

        case 'code.execute':
          result = this.codeExecutor.execute(input, params.options as { timeout?: number });
          break;

        case 'assistants.list':
          result = this.getBootstrapAssistants();
          break;

        default:
          return this.failure(`Unknown tool: ${params.tool}`, Date.now() - start);
      }

      // Store result in context if resultKey specified
      if (params.resultKey) {
        context.context[params.resultKey] = result;
      }

      // Also store in steps for template reference
      const actionId = (config as { id?: string }).id;
      if (actionId) {
        if (!context.context.steps) {
          context.context.steps = {};
        }
        (context.context.steps as Record<string, unknown>)[actionId] = { result };
      }

      return this.success({ result }, Date.now() - start);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool invocation failed';
      return this.failure(message, Date.now() - start);
    }
  }

  private executeMathEvaluate(input: string): number {
    if (!input || input.trim() === '') {
      throw new Error('No expression provided');
    }

    const result = this.mathEvaluator.evaluate(normalizeMathInput(input));

    if (!isFinite(result)) {
      throw new Error('Result is not a finite number');
    }

    return Math.round(result * 1e10) / 1e10;
  }

  /**
   * The roster, from the registry.
   *
   * THIS USED TO BE A LITERAL ARRAY IN THIS FILE.
   *
   * A tool called `assistants.list` that returns eight hardcoded names is not a
   * list of assistants; it is a fifth copy of a roster that also lived in the
   * coordinator's help text, its orchestrate prompt, and two alias tables. It
   * was wrong in both directions at once — it named `coordinator` as something
   * to delegate to, which is a loop, and it omitted `analyst` and `builder`,
   * which are registered and published. An assistant registered through the
   * catalog could never appear here, which defeats the point of registering it.
   *
   * The registry is `assistant-loader`. Reading it means a newly registered
   * assistant is routable the moment it loads, with nothing to update here.
   */
  private getBootstrapAssistants(): Array<{ alias: string; key: string; description: string }> {
    return getAllLoadedAssistants()
      .map((loaded) => {
        const key = loadedAssistantKey(loaded);
        if (!key) return undefined;
        return {
          key,
          alias: loaded.alias || key,
          description: loaded.resource?.description || '',
        };
      })
      .filter((a): a is { alias: string; key: string; description: string } => Boolean(a))
      .sort((a, b) => a.key.localeCompare(b.key));
  }
}
