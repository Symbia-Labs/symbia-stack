#!/usr/bin/env npx tsx
/**
 * Generate V8 Isolate Component Implementations
 *
 * This script generates JavaScript implementations for all V8 isolate executors,
 * uploads them as artifacts to the catalog, and updates executors with artifact references.
 *
 * Usage:
 *   npx tsx scripts/generate-v8-implementations.ts [--dry-run] [--category <name>]
 */

const CATALOG_URL = process.env.CATALOG_ENDPOINT || 'http://localhost:5052';
const API_KEY = process.env.OBJECT_SERVICE_API_KEY || process.env.CATALOG_API_KEY;

const DRY_RUN = process.argv.includes('--dry-run');

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (API_KEY) {
    headers['X-API-Key'] = API_KEY;
  }
  return headers;
}
const CATEGORY_FILTER = process.argv.includes('--category')
  ? process.argv[process.argv.indexOf('--category') + 1]
  : null;

interface Port {
  id: string;
  label: string;
  type: string;
}

interface Executor {
  id: string;
  key: string;
  name: string;
  metadata: {
    componentKey: string;
    ports?: {
      inputs?: Port[];
      outputs?: Port[];
      configs?: Port[];
    };
  };
}

/**
 * Component implementation templates
 * Each returns a factory function that creates a handler with process method
 */
const IMPLEMENTATIONS: Record<string, string> = {
  // ============ MATH ============
  'math/Abs': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.abs(Number(value)));
  }
})`,

  'math/Avg2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', (a + b) / 2);
    }
  }
})`,

  'math/Ceil': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.ceil(Number(value)));
  }
})`,

  'math/Clamp': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const min = config.min ?? 0;
    const max = config.max ?? 1;
    emit('out', Math.max(min, Math.min(max, Number(value))));
  }
})`,

  'math/Floor': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.floor(Number(value)));
  }
})`,

  'math/Max2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', Math.max(a, b));
    }
  }
})`,

  'math/Min2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', Math.min(a, b));
    }
  }
})`,

  'math/Pow': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'base') await setState('base', Number(value));
    if (port === 'exp') await setState('exp', Number(value));
    const base = await getState('base');
    const exp = await getState('exp');
    if (base !== undefined && exp !== undefined) {
      emit('out', Math.pow(base, exp));
    }
  }
})`,

  'math/Round': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.round(Number(value)));
  }
})`,

  'math/Sign': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.sign(Number(value)));
  }
})`,

  'math/Sqrt': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.sqrt(Number(value)));
  }
})`,

  // ============ CONTROL ============
  'control/Add2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a') ?? 0;
    const b = await getState('b') ?? 0;
    emit('out', a + b);
  }
})`,

  'control/Add4': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    await setState(port, Number(value));
    const a = await getState('a') ?? 0;
    const b = await getState('b') ?? 0;
    const c = await getState('c') ?? 0;
    const d = await getState('d') ?? 0;
    emit('out', a + b + c + d);
  }
})`,

  'control/ConstBool': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    emit('out', Boolean(config.value ?? false));
  }
})`,

  'control/ConstFloat': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    emit('out', Number(config.value ?? 0));
  }
})`,

  'control/ConstInt': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    emit('out', Math.floor(Number(config.value ?? 0)));
  }
})`,

  'control/ConstString': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    emit('out', String(config.value ?? ''));
  }
})`,

  'control/Div2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined && b !== 0) {
      emit('out', a / b);
    }
  }
})`,

  'control/Mod': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined && b !== 0) {
      emit('out', a % b);
    }
  }
})`,

  'control/Mul2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a') ?? 1;
    const b = await getState('b') ?? 1;
    emit('out', a * b);
  }
})`,

  'control/Sub2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a') ?? 0;
    const b = await getState('b') ?? 0;
    emit('out', a - b);
  }
})`,

  // ============ LOGIC ============
  'logic/And2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Boolean(value));
    if (port === 'b') await setState('b', Boolean(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', a && b);
    }
  }
})`,

  'logic/And4': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    await setState(port, Boolean(value));
    const a = await getState('a');
    const b = await getState('b');
    const c = await getState('c');
    const d = await getState('d');
    if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) {
      emit('out', a && b && c && d);
    }
  }
})`,

  'logic/Between': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const v = Number(value);
    const min = config.min ?? 0;
    const max = config.max ?? 1;
    emit('out', v >= min && v <= max);
  }
})`,

  'logic/Coalesce': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    await setState(port, value);
    const a = await getState('a');
    const b = await getState('b');
    emit('out', a ?? b ?? null);
  }
})`,

  'logic/Compare': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const op = config.op ?? 'eq';
    const target = config.value;
    let result = false;
    switch (op) {
      case 'eq': result = value === target; break;
      case 'ne': result = value !== target; break;
      case 'gt': result = value > target; break;
      case 'gte': result = value >= target; break;
      case 'lt': result = value < target; break;
      case 'lte': result = value <= target; break;
    }
    emit('out', result);
  }
})`,

  'logic/Equals': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', a === b);
    }
  }
})`,

  'logic/GreaterThan': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', a > b);
    }
  }
})`,

  'logic/If': `({ emit }) => ({
  process: async (ctx, port, value) => {
    if (port === 'condition') {
      emit(Boolean(value) ? 'true' : 'false', value);
    }
  }
})`,

  'logic/LessThan': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Number(value));
    if (port === 'b') await setState('b', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', a < b);
    }
  }
})`,

  'logic/Not': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', !Boolean(value));
  }
})`,

  'logic/Or2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Boolean(value));
    if (port === 'b') await setState('b', Boolean(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', a || b);
    }
  }
})`,

  'logic/Or4': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    await setState(port, Boolean(value));
    const a = await getState('a');
    const b = await getState('b');
    const c = await getState('c');
    const d = await getState('d');
    if (a !== undefined && b !== undefined && c !== undefined && d !== undefined) {
      emit('out', a || b || c || d);
    }
  }
})`,

  'logic/Xor2': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', Boolean(value));
    if (port === 'b') await setState('b', Boolean(value));
    const a = await getState('a');
    const b = await getState('b');
    if (a !== undefined && b !== undefined) {
      emit('out', (a && !b) || (!a && b));
    }
  }
})`,

  // ============ STRING ============
  'string/Concat': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const sep = config.separator ?? '';
    const arr = Array.isArray(value) ? value : [value];
    emit('out', arr.map(String).join(sep));
  }
})`,

  'string/Contains': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const search = config.search ?? '';
    emit('out', String(value).includes(search));
  }
})`,

  'string/Join': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const sep = config.separator ?? ',';
    const arr = Array.isArray(value) ? value : [value];
    emit('out', arr.map(String).join(sep));
  }
})`,

  'string/Length': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', String(value).length);
  }
})`,

  'string/RegexMatch': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const pattern = config.pattern ?? '';
    const flags = config.flags ?? '';
    const regex = new RegExp(pattern, flags);
    const match = String(value).match(regex);
    emit('matches', match || []);
    emit('matched', match !== null);
  }
})`,

  'string/RegexReplace': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const pattern = config.pattern ?? '';
    const replacement = config.replacement ?? '';
    const flags = config.flags ?? 'g';
    const regex = new RegExp(pattern, flags);
    emit('out', String(value).replace(regex, replacement));
  }
})`,

  'string/Slice': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const start = config.start ?? 0;
    const end = config.end;
    emit('out', String(value).slice(start, end));
  }
})`,

  'string/Split': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const separator = config.separator ?? ',';
    emit('out', String(value).split(separator));
  }
})`,

  'string/Template': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    let template = config.template ?? '';
    const values = typeof value === 'object' && value !== null ? value : { value };
    for (const [k, v] of Object.entries(values)) {
      template = template.replace(new RegExp('\\\\{\\\\{' + k + '\\\\}\\\\}', 'g'), String(v));
    }
    emit('out', template);
  }
})`,

  'string/ToLower': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', String(value).toLowerCase());
  }
})`,

  'string/ToUpper': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', String(value).toUpperCase());
  }
})`,

  'string/Trim': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', String(value).trim());
  }
})`,

  // ============ DATA / ARRAY ============
  'data/ArrayAt': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const index = config.index ?? 0;
    const arr = Array.isArray(value) ? value : [];
    emit('out', arr.at(index));
  }
})`,

  'data/ArrayChunk': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const size = config.size ?? 1;
    const arr = Array.isArray(value) ? value : [];
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size));
    }
    emit('out', chunks);
  }
})`,

  'data/ArrayFilter': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const condition = config.condition ?? 'true';
    const arr = Array.isArray(value) ? value : [];
    try {
      const fn = new Function('item', 'index', 'return ' + condition);
      emit('out', arr.filter((item, index) => fn(item, index)));
    } catch (e) {
      emit('error', { error: e.message, value });
    }
  }
})`,

  'data/ArrayFlatten': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const depth = config.depth ?? 1;
    const arr = Array.isArray(value) ? value : [value];
    emit('out', arr.flat(depth));
  }
})`,

  'data/ArrayLength': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Array.isArray(value) ? value.length : 0);
  }
})`,

  'data/ArrayMap': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const transform = config.transform ?? 'item';
    const arr = Array.isArray(value) ? value : [];
    try {
      const fn = new Function('item', 'index', 'return ' + transform);
      emit('out', arr.map((item, index) => fn(item, index)));
    } catch (e) {
      emit('error', { error: e.message, value });
    }
  }
})`,

  'data/ArrayPush': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    let arr = await getState('array') || [];
    arr = [...arr, value];
    await setState('array', arr);
    emit('out', arr);
  }
})`,

  'data/ArrayReduce': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const arr = Array.isArray(value) ? value : [];
    const op = config.op ?? 'sum';
    let result;
    switch (op) {
      case 'sum': result = arr.reduce((a, b) => a + Number(b), 0); break;
      case 'product': result = arr.reduce((a, b) => a * Number(b), 1); break;
      case 'min': result = Math.min(...arr.map(Number)); break;
      case 'max': result = Math.max(...arr.map(Number)); break;
      case 'count': result = arr.length; break;
      case 'concat': result = arr.join(''); break;
      default: result = arr;
    }
    emit('out', result);
  }
})`,

  'data/ArraySlice': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const start = config.start ?? 0;
    const end = config.end;
    const arr = Array.isArray(value) ? value : [];
    emit('out', arr.slice(start, end));
  }
})`,

  'data/ArraySort': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const arr = Array.isArray(value) ? [...value] : [];
    const order = config.order ?? 'asc';
    const key = config.key;
    arr.sort((a, b) => {
      const va = key ? a[key] : a;
      const vb = key ? b[key] : b;
      if (va < vb) return order === 'asc' ? -1 : 1;
      if (va > vb) return order === 'asc' ? 1 : -1;
      return 0;
    });
    emit('out', arr);
  }
})`,

  'data/ArrayUnique': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const arr = Array.isArray(value) ? value : [];
    emit('out', [...new Set(arr)]);
  }
})`,

  'data/Base64Decode': `({ emit }) => ({
  process: async (ctx, port, value) => {
    try {
      emit('out', atob(String(value)));
    } catch (e) {
      emit('error', { error: e.message });
    }
  }
})`,

  'data/Base64Encode': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', btoa(String(value)));
  }
})`,

  'data/Merge': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    await setState(port, value);
    const a = await getState('a') ?? {};
    const b = await getState('b') ?? {};
    emit('out', { ...a, ...b });
  }
})`,

  'data/ObjectKeys': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Object.keys(value ?? {}));
  }
})`,

  'data/ObjectValues': `({ emit }) => ({
  process: async (ctx, port, value) => {
    emit('out', Object.values(value ?? {}));
  }
})`,

  'data/ParseJSON': `({ emit }) => ({
  process: async (ctx, port, value) => {
    try {
      const parsed = typeof value === 'string' ? JSON.parse(value) : value;
      emit('out', parsed);
    } catch (e) {
      emit('error', { error: e.message, input: value });
    }
  }
})`,

  'data/PathGet': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const path = config.path ?? '';
    const defaultValue = config.default;
    let result = value;
    for (const part of path.split('.')) {
      if (result == null) { result = defaultValue; break; }
      result = result[part];
    }
    emit('out', result ?? defaultValue);
  }
})`,

  'data/PathSet': `({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'obj') await setState('obj', value);
    if (port === 'value') await setState('value', value);
    const obj = await getState('obj');
    const val = await getState('value');
    if (obj !== undefined && val !== undefined) {
      const path = config.path ?? '';
      const parts = path.split('.');
      const result = JSON.parse(JSON.stringify(obj));
      let current = result;
      for (let i = 0; i < parts.length - 1; i++) {
        if (current[parts[i]] === undefined) current[parts[i]] = {};
        current = current[parts[i]];
      }
      current[parts[parts.length - 1]] = val;
      emit('out', result);
    }
  }
})`,

  'data/Pick': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const keys = config.keys ?? [];
    const obj = value ?? {};
    const result = {};
    for (const key of keys) {
      if (key in obj) result[key] = obj[key];
    }
    emit('out', result);
  }
})`,

  'data/StringifyJSON': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const pretty = config.pretty !== false;
    emit('out', JSON.stringify(value, null, pretty ? 2 : 0));
  }
})`,

  // ============ FUNC ============
  'func/Deadband': `({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    const threshold = config.threshold ?? 0.1;
    const last = await getState('last');
    const v = Number(value);
    if (last === undefined || Math.abs(v - last) >= threshold) {
      await setState('last', v);
      emit('out', v);
    }
  }
})`,

  'func/Gate': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'open') await setState('open', Boolean(value));
    if (port === 'in') {
      const open = await getState('open');
      if (open) emit('out', value);
    }
  }
})`,

  'func/Limiter': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const min = config.min ?? -Infinity;
    const max = config.max ?? Infinity;
    emit('out', Math.max(min, Math.min(max, Number(value))));
  }
})`,

  'func/MapRange': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const inMin = config.inMin ?? 0;
    const inMax = config.inMax ?? 1;
    const outMin = config.outMin ?? 0;
    const outMax = config.outMax ?? 1;
    const v = Number(value);
    const mapped = outMin + (v - inMin) * (outMax - outMin) / (inMax - inMin);
    emit('out', mapped);
  }
})`,

  'func/Ramp': `({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    const rate = config.rate ?? 1;
    const current = await getState('current') ?? 0;
    const target = Number(value);
    const diff = target - current;
    const step = Math.sign(diff) * Math.min(Math.abs(diff), rate);
    const next = current + step;
    await setState('current', next);
    emit('out', next);
  }
})`,

  'func/Switch': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const cases = config.cases ?? {};
    const defaultValue = config.default;
    const key = String(value);
    emit('out', cases[key] ?? defaultValue);
  }
})`,

  // ============ LINEAR ALGEBRA ============
  'linear/LinearSolve': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const A = await getState('a');
    const b = await getState('b');
    if (A && b) {
      // Simple Gaussian elimination for small systems
      const n = b.length;
      const aug = A.map((row, i) => [...row, b[i]]);
      for (let i = 0; i < n; i++) {
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
          if (Math.abs(aug[k][i]) > Math.abs(aug[maxRow][i])) maxRow = k;
        }
        [aug[i], aug[maxRow]] = [aug[maxRow], aug[i]];
        for (let k = i + 1; k < n; k++) {
          const c = aug[k][i] / aug[i][i];
          for (let j = i; j <= n; j++) aug[k][j] -= c * aug[i][j];
        }
      }
      const x = new Array(n);
      for (let i = n - 1; i >= 0; i--) {
        x[i] = aug[i][n] / aug[i][i];
        for (let k = i - 1; k >= 0; k--) aug[k][n] -= aug[k][i] * x[i];
      }
      emit('out', x);
    }
  }
})`,

  'linear/MatrixMultiply': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const A = await getState('a');
    const B = await getState('b');
    if (A && B) {
      const result = A.map((row, i) =>
        B[0].map((_, j) => row.reduce((sum, _, k) => sum + A[i][k] * B[k][j], 0))
      );
      emit('out', result);
    }
  }
})`,

  'linear/MatrixTranspose': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const m = Array.isArray(value) ? value : [];
    if (m.length === 0) { emit('out', []); return; }
    const result = m[0].map((_, i) => m.map(row => row[i]));
    emit('out', result);
  }
})`,

  'linear/VectorAdd': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const a = await getState('a');
    const b = await getState('b');
    if (a && b) {
      emit('out', a.map((v, i) => v + b[i]));
    }
  }
})`,

  'linear/VectorDot': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const a = await getState('a');
    const b = await getState('b');
    if (a && b) {
      emit('out', a.reduce((sum, v, i) => sum + v * b[i], 0));
    }
  }
})`,

  'linear/VectorNorm': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const v = Array.isArray(value) ? value : [];
    emit('out', Math.sqrt(v.reduce((sum, x) => sum + x * x, 0)));
  }
})`,

  'linear/VectorSub': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const a = await getState('a');
    const b = await getState('b');
    if (a && b) {
      emit('out', a.map((v, i) => v - b[i]));
    }
  }
})`,

  // ============ COMPLEX ============
  'complex/Add': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const a = await getState('a');
    const b = await getState('b');
    if (a && b) {
      emit('out', { re: a.re + b.re, im: a.im + b.im });
    }
  }
})`,

  'complex/FromPolar': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'r') await setState('r', Number(value));
    if (port === 'theta') await setState('theta', Number(value));
    const r = await getState('r');
    const theta = await getState('theta');
    if (r !== undefined && theta !== undefined) {
      emit('out', { re: r * Math.cos(theta), im: r * Math.sin(theta) });
    }
  }
})`,

  'complex/Magnitude': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const { re = 0, im = 0 } = value ?? {};
    emit('out', Math.sqrt(re * re + im * im));
  }
})`,

  'complex/Mul': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const a = await getState('a');
    const b = await getState('b');
    if (a && b) {
      emit('out', {
        re: a.re * b.re - a.im * b.im,
        im: a.re * b.im + a.im * b.re
      });
    }
  }
})`,

  'complex/Sub': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    const a = await getState('a');
    const b = await getState('b');
    if (a && b) {
      emit('out', { re: a.re - b.re, im: a.im - b.im });
    }
  }
})`,

  // ============ GEOMETRY ============
  'geometry/Angle2D': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'p1') await setState('p1', value);
    if (port === 'p2') await setState('p2', value);
    const p1 = await getState('p1');
    const p2 = await getState('p2');
    if (p1 && p2) {
      emit('out', Math.atan2(p2.y - p1.y, p2.x - p1.x));
    }
  }
})`,

  'geometry/Distance2D': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'p1') await setState('p1', value);
    if (port === 'p2') await setState('p2', value);
    const p1 = await getState('p1');
    const p2 = await getState('p2');
    if (p1 && p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      emit('out', Math.sqrt(dx * dx + dy * dy));
    }
  }
})`,

  'geometry/PolygonArea': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const points = Array.isArray(value) ? value : [];
    let area = 0;
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      area += points[i].x * points[j].y;
      area -= points[j].x * points[i].y;
    }
    emit('out', Math.abs(area) / 2);
  }
})`,

  // ============ COLOR ============
  'color/Contrast': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const factor = config.factor ?? 1;
    const { r, g, b } = value ?? { r: 0, g: 0, b: 0 };
    const adjust = (c) => Math.max(0, Math.min(255, ((c / 255 - 0.5) * factor + 0.5) * 255));
    emit('out', { r: adjust(r), g: adjust(g), b: adjust(b) });
  }
})`,

  'color/HexToRgb': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const hex = String(value).replace('#', '');
    const num = parseInt(hex, 16);
    emit('out', {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255
    });
  }
})`,

  'color/Interpolate': `({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'a') await setState('a', value);
    if (port === 'b') await setState('b', value);
    if (port === 't') await setState('t', Number(value));
    const a = await getState('a');
    const b = await getState('b');
    const t = await getState('t') ?? 0.5;
    if (a && b) {
      emit('out', {
        r: Math.round(a.r + (b.r - a.r) * t),
        g: Math.round(a.g + (b.g - a.g) * t),
        b: Math.round(a.b + (b.b - a.b) * t)
      });
    }
  }
})`,

  'color/RgbToHex': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const { r = 0, g = 0, b = 0 } = value ?? {};
    const toHex = (c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0');
    emit('out', '#' + toHex(r) + toHex(g) + toHex(b));
  }
})`,

  // ============ AUDIO ============
  'audio/Gain': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const gain = config.gain ?? 1;
    if (Array.isArray(value)) {
      emit('out', value.map(s => s * gain));
    } else {
      emit('out', Number(value) * gain);
    }
  }
})`,

  'audio/Normalize': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const samples = Array.isArray(value) ? value : [];
    const max = Math.max(...samples.map(Math.abs));
    emit('out', max > 0 ? samples.map(s => s / max) : samples);
  }
})`,

  'audio/RMS': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const samples = Array.isArray(value) ? value : [];
    const sum = samples.reduce((acc, s) => acc + s * s, 0);
    emit('out', Math.sqrt(sum / samples.length));
  }
})`,

  'audio/SineWave': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const freq = config.frequency ?? 440;
    const sampleRate = config.sampleRate ?? 44100;
    const duration = config.duration ?? 1;
    const samples = [];
    const numSamples = Math.floor(sampleRate * duration);
    for (let i = 0; i < numSamples; i++) {
      samples.push(Math.sin(2 * Math.PI * freq * i / sampleRate));
    }
    emit('out', samples);
  }
})`,

  // ============ CRYPTO ============
  'crypto/AESGCMDecrypt': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    // Note: Real implementation would use WebCrypto API
    emit('out', { decrypted: value, note: 'Requires WebCrypto implementation' });
  }
})`,

  'crypto/AESGCMEncrypt': `({ emit, getState, setState }) => ({
  process: async (ctx, port, value) => {
    // Note: Real implementation would use WebCrypto API
    emit('out', { encrypted: value, note: 'Requires WebCrypto implementation' });
  }
})`,

  'crypto/HMAC': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    // Note: Real implementation would use WebCrypto API
    emit('out', { hmac: 'placeholder', input: value });
  }
})`,

  'crypto/Hash': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    // Simple hash for demo - real implementation would use WebCrypto
    const str = String(value);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    emit('out', hash.toString(16));
  }
})`,

  // ============ STATS ============
  'stats/Binomial': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const n = config.n ?? Number(value);
    const k = config.k ?? 0;
    const factorial = (x) => x <= 1 ? 1 : x * factorial(x - 1);
    const result = factorial(n) / (factorial(k) * factorial(n - k));
    emit('out', result);
  }
})`,

  'stats/Factorial': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const n = Math.floor(Number(value));
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    emit('out', result);
  }
})`,

  'stats/MeanVariance': `({ emit }) => ({
  process: async (ctx, port, value) => {
    const arr = Array.isArray(value) ? value.map(Number) : [];
    const n = arr.length;
    if (n === 0) { emit('mean', 0); emit('variance', 0); return; }
    const mean = arr.reduce((a, b) => a + b, 0) / n;
    const variance = arr.reduce((acc, v) => acc + (v - mean) ** 2, 0) / n;
    emit('mean', mean);
    emit('variance', variance);
  }
})`,

  'stats/RandomNormal': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const mean = config.mean ?? 0;
    const stddev = config.stddev ?? 1;
    // Box-Muller transform
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    emit('out', mean + z * stddev);
  }
})`,

  // ============ OBSERVABILITY ============
  'observability/Log': `({ emit, log, config }) => ({
  process: async (ctx, port, value) => {
    const level = config.level ?? 'info';
    log(level, JSON.stringify(value));
    emit('out', value);
  }
})`,

  // ============ PARSE ============
  'parse/CSVParse': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const text = String(value);
    const hasHeader = config.hasHeader !== false;
    const delimiter = config.delimiter ?? ',';
    const lines = text.split(/\\r?\\n/).filter(l => l.trim());
    if (lines.length === 0) { emit('rows', []); return; }
    const parseRow = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (const char of line) {
        if (char === '"') inQuotes = !inQuotes;
        else if (char === delimiter && !inQuotes) { result.push(current.trim()); current = ''; }
        else current += char;
      }
      result.push(current.trim());
      return result;
    };
    const header = hasHeader ? parseRow(lines[0]) : null;
    const dataLines = hasHeader ? lines.slice(1) : lines;
    const rows = dataLines.map(line => {
      const values = parseRow(line);
      if (header) {
        const obj = {};
        header.forEach((h, i) => { obj[h] = values[i]; });
        return obj;
      }
      return values;
    });
    emit('rows', rows);
  }
})`,

  'parse/CSVStringify': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const rows = Array.isArray(value) ? value : [];
    const includeHeader = config.includeHeader !== false;
    const delimiter = config.delimiter ?? ',';
    if (rows.length === 0) { emit('text', ''); return; }
    const lines = [];
    if (typeof rows[0] === 'object' && !Array.isArray(rows[0])) {
      const keys = Object.keys(rows[0]);
      if (includeHeader) lines.push(keys.join(delimiter));
      for (const row of rows) lines.push(keys.map(k => row[k] ?? '').join(delimiter));
    } else {
      for (const row of rows) lines.push((Array.isArray(row) ? row : [row]).join(delimiter));
    }
    emit('text', lines.join('\\n'));
  }
})`,

  'parse/YAMLParse': `({ emit }) => ({
  process: async (ctx, port, value) => {
    // Simple YAML subset parser - real impl would use yaml library
    try {
      const text = String(value);
      // For now, try JSON parse as fallback
      emit('json', JSON.parse(text));
    } catch (e) {
      emit('error', { error: 'YAML parsing requires yaml library', input: value });
    }
  }
})`,

  // ============ VALIDATE ============
  'validate/JSONSchema': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const schema = config.schema ?? {};
    // Simple type validation - real impl would use ajv
    const errors = [];
    if (schema.type) {
      const actualType = Array.isArray(value) ? 'array' : typeof value;
      if (actualType !== schema.type) errors.push({ path: '', message: \`Expected \${schema.type}, got \${actualType}\` });
    }
    if (schema.required && typeof value === 'object') {
      for (const field of schema.required) {
        if (!(field in value)) errors.push({ path: field, message: 'Required field missing' });
      }
    }
    emit('valid', errors.length === 0);
    emit('errors', errors);
  }
})`,

  'validate/RequiredFields': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const fields = config.fields ?? [];
    const obj = value ?? {};
    const missing = fields.filter(f => !(f in obj) || obj[f] === undefined || obj[f] === null);
    emit('valid', missing.length === 0);
    emit('missing', missing);
  }
})`,

  // ============ HTTP ============
  'http/BuildUrl': `({ emit, config, getState, setState }) => ({
  process: async (ctx, port, value) => {
    if (port === 'base') await setState('base', String(value));
    if (port === 'path') await setState('path', String(value));
    if (port === 'query') await setState('query', value);
    const base = await getState('base') ?? '';
    const path = await getState('path') ?? '';
    const query = await getState('query') ?? {};
    let url = base.replace(/\\/$/, '') + '/' + path.replace(/^\\//, '');
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.append(k, String(v));
    }
    const qs = params.toString();
    if (qs) url += '?' + qs;
    emit('url', url);
  }
})`,

  // ============ SECRETS ============
  'secrets/Redact': `({ emit, config }) => ({
  process: async (ctx, port, value) => {
    const mask = config.mask ?? '***';
    const patterns = config.patterns ?? ['password', 'secret', 'token', 'key', 'auth'];
    const redact = (obj) => {
      if (typeof obj !== 'object' || obj === null) return obj;
      const result = Array.isArray(obj) ? [] : {};
      for (const [k, v] of Object.entries(obj)) {
        const shouldRedact = patterns.some(p => k.toLowerCase().includes(p.toLowerCase()));
        result[k] = shouldRedact ? mask : (typeof v === 'object' ? redact(v) : v);
      }
      return result;
    };
    emit('output', redact(value));
  }
})`,
};

async function fetchExecutors(): Promise<Executor[]> {
  const response = await fetch(`${CATALOG_URL}/api/resources`, {
    headers: getAuthHeaders()
  });
  const resources = await response.json() as any[];
  return resources.filter(r => r.type === 'executor' && r.key.includes('v8-isolate'));
}

async function uploadArtifact(resourceId: string, source: string): Promise<string> {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would upload artifact for ${resourceId}`);
    return 'dry-run-artifact-id';
  }

  const content = Buffer.from(source, 'utf8').toString('base64');
  const response = await fetch(`${CATALOG_URL}/api/resources/${resourceId}/artifacts`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      name: 'executor.js',
      type: 'text/javascript',
      content
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload artifact: ${error}`);
  }

  const artifact = await response.json() as { id: string };
  return artifact.id;
}

async function updateExecutor(executorId: string, artifactId: string): Promise<void> {
  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would update executor ${executorId} with artifact ${artifactId}`);
    return;
  }

  const response = await fetch(`${CATALOG_URL}/api/resources/${executorId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      metadata: { artifactRef: artifactId }
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to update executor: ${error}`);
  }
}

async function main() {
  console.log('=== V8 Component Implementation Generator ===\n');
  console.log(`Catalog: ${CATALOG_URL}`);
  console.log(`Dry run: ${DRY_RUN}`);
  console.log(`Category filter: ${CATEGORY_FILTER || 'all'}\n`);

  const executors = await fetchExecutors();
  console.log(`Found ${executors.length} V8 isolate executors\n`);

  const stats = {
    total: 0,
    generated: 0,
    uploaded: 0,
    skipped: 0,
    missing: 0,
    errors: 0
  };

  for (const executor of executors) {
    const componentKey = executor.metadata.componentKey;
    if (!componentKey) {
      console.log(`⚠ ${executor.key}: missing componentKey`);
      stats.skipped++;
      continue;
    }

    // Extract category from componentKey (e.g., "math/Abs" -> "math")
    const category = componentKey.split('/')[0];
    if (CATEGORY_FILTER && category !== CATEGORY_FILTER) {
      continue;
    }

    stats.total++;

    const implementation = IMPLEMENTATIONS[componentKey];
    if (!implementation) {
      console.log(`⚠ ${componentKey}: no implementation defined`);
      stats.missing++;
      continue;
    }

    try {
      console.log(`✓ ${componentKey}`);
      stats.generated++;

      // Upload artifact
      const artifactId = await uploadArtifact(executor.id, implementation);
      stats.uploaded++;

      // Update executor
      await updateExecutor(executor.id, artifactId);

    } catch (error) {
      console.log(`✗ ${componentKey}: ${error instanceof Error ? error.message : error}`);
      stats.errors++;
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total processed: ${stats.total}`);
  console.log(`Implementations available: ${stats.generated}`);
  console.log(`Artifacts uploaded: ${stats.uploaded}`);
  console.log(`Missing implementations: ${stats.missing}`);
  console.log(`Skipped: ${stats.skipped}`);
  console.log(`Errors: ${stats.errors}`);
}

main().catch(console.error);
