import type { Resource } from '@shared/schema';

export interface RegistrySummaryCategory {
  id: string;
  label: string;
  count: number;
}

export interface RegistrySummary {
  generatedAt: string;
  contexts: {
    total: number;
    categories: RegistrySummaryCategory[];
  };
  graphs: {
    total: number;
  };
  integrations: {
    total: number;
  };
  assistants: {
    total: number;
  };
}

const CONTEXT_LABELS: Record<string, string> = {
  architecture: 'Architecture',
  domain: 'Domains',
  identity: 'Identity',
  industry: 'Industries',
  mission: 'Mission',
  persona: 'Personas',
  use_case: 'Use Cases',
  workspace: 'Workspace',
};

const ACRONYMS = new Set([
  'AI',
  'API',
  'CSV',
  'DNS',
  'HTTP',
  'HTTPS',
  'IO',
  'IT',
  'JSON',
  'MCP',
  'MQTT',
  'OT',
  'PII',
  'RAG',
  'S3',
  'SQL',
  'TCP',
  'UDP',
  'URI',
  'URL',
  'UUID',
  'XML',
  'YAML',
]);

function humanize(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
}

function formatToken(word: string): string {
  if (!word) return word;
  const upper = word.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  return word[0].toUpperCase() + word.slice(1).toLowerCase();
}

function titleize(text: string): string {
  return humanize(text)
    .split(' ')
    .filter(Boolean)
    .map((word) => formatToken(word))
    .join(' ')
    .trim();
}

function getContextCategoryId(resource: Resource): string {
  const metadata = resource.metadata as Record<string, unknown> | null;
  const metaKind = metadata?.kind;
  if (typeof metaKind === 'string' && metaKind.trim()) {
    return metaKind.trim();
  }
  const key = resource.key || '';
  const parts = key.split('/');
  return parts.length > 1 ? parts[1] : parts[0] || 'context';
}

function compareByCountThenLabel(a: RegistrySummaryCategory, b: RegistrySummaryCategory): number {
  if (b.count !== a.count) return b.count - a.count;
  return a.label.localeCompare(b.label);
}

export function buildBootstrapSummary(resources: Resource[]): RegistrySummary {
  const contextResources = resources.filter((r) => r.type === 'context');
  const graphResources = resources.filter((r) => r.type === 'graph');
  const integrationResources = resources.filter((r) => r.type === 'integration');
  const assistantResources = resources.filter((r) => r.type === 'assistant');

  const contextCategoryMap = new Map<string, RegistrySummaryCategory>();
  for (const resource of contextResources) {
    const categoryId = getContextCategoryId(resource);
    const label = CONTEXT_LABELS[categoryId] || titleize(categoryId);
    const existing = contextCategoryMap.get(categoryId);
    if (existing) {
      existing.count += 1;
    } else {
      contextCategoryMap.set(categoryId, { id: categoryId, label, count: 1 });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    contexts: {
      total: contextResources.length,
      categories: Array.from(contextCategoryMap.values()).sort(compareByCountThenLabel),
    },
    graphs: {
      total: graphResources.length,
    },
    integrations: {
      total: integrationResources.length,
    },
    assistants: {
      total: assistantResources.length,
    },
  };
}
