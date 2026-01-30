/**
 * Routing Benchmarks
 *
 * Benchmarks for intent classification and routing decisions.
 * These test the model's ability to correctly route user requests
 * to the appropriate assistant or handler.
 */

import type { BenchmarkDefinition, TestCase } from "../../types.js";

// =============================================================================
// Intent Classification Test Cases
// =============================================================================

const intentClassificationCases: TestCase[] = [
  // Coding intents
  {
    id: "routing.intent.code-review",
    name: "Code review request",
    input: {
      messages: [
        { role: "user", content: "Can you review this Python function for bugs?" },
      ],
    },
    expected: {
      contains: ["code"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["code", "high-frequency"],
  },
  {
    id: "routing.intent.code-generation",
    name: "Code generation request",
    input: {
      messages: [
        { role: "user", content: "Write a function that calculates fibonacci numbers" },
      ],
    },
    expected: {
      contains: ["code"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["code", "high-frequency"],
  },
  {
    id: "routing.intent.debug",
    name: "Debug request",
    input: {
      messages: [
        { role: "user", content: "I'm getting a NullPointerException in my Java app" },
      ],
    },
    expected: {
      contains: ["code", "debug"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["code", "debugging"],
  },

  // Research intents
  {
    id: "routing.intent.web-search",
    name: "Web search request",
    input: {
      messages: [
        { role: "user", content: "What are the latest developments in quantum computing?" },
      ],
    },
    expected: {
      contains: ["research", "search"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["research", "high-frequency"],
  },
  {
    id: "routing.intent.fact-check",
    name: "Fact checking request",
    input: {
      messages: [
        { role: "user", content: "Is it true that the Great Wall of China is visible from space?" },
      ],
    },
    expected: {
      contains: ["research", "fact"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["research", "reasoning"],
  },

  // Conversational intents
  {
    id: "routing.intent.greeting",
    name: "Simple greeting",
    input: {
      messages: [
        { role: "user", content: "Hello, how are you doing today?" },
      ],
    },
    expected: {
      contains: ["conversational", "general"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["conversational", "high-frequency"],
  },
  {
    id: "routing.intent.clarification",
    name: "Clarification question",
    input: {
      messages: [
        { role: "user", content: "Can you explain what you meant by that?" },
      ],
    },
    expected: {
      contains: ["conversational", "clarify"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["conversational"],
  },

  // Task intents
  {
    id: "routing.intent.summarize",
    name: "Summarization request",
    input: {
      messages: [
        { role: "user", content: "Summarize this article about climate change for me" },
      ],
    },
    expected: {
      contains: ["task", "summarize"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["task", "high-frequency"],
  },
  {
    id: "routing.intent.translate",
    name: "Translation request",
    input: {
      messages: [
        { role: "user", content: "Translate this text to Spanish" },
      ],
    },
    expected: {
      contains: ["task", "translate"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["task"],
  },

  // Ambiguous intents (harder cases)
  {
    id: "routing.intent.ambiguous-code-question",
    name: "Ambiguous code vs. research",
    description: "Could be asking about code or for research about Python",
    input: {
      messages: [
        { role: "user", content: "Tell me about Python" },
      ],
    },
    expected: {
      contains: ["clarify"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["ambiguous", "edge-case"],
  },
  {
    id: "routing.intent.multi-intent",
    name: "Multiple intents in one request",
    input: {
      messages: [
        { role: "user", content: "Search for React best practices and then write me a component" },
      ],
    },
    expected: {
      contains: ["research", "code"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["multi-intent", "edge-case"],
  },
];

// =============================================================================
// Hybrid Routing Decision Test Cases
// =============================================================================

const hybridRoutingCases: TestCase[] = [
  {
    id: "routing.hybrid.embedding-vs-llm",
    name: "Embedding fallback decision",
    description: "Test when to use embeddings vs. LLM for routing",
    input: {
      messages: [
        {
          role: "system",
          content: `You are a routing classifier. Given the user query, decide the routing method.
Output JSON: { "method": "embedding" | "llm", "confidence": 0-1, "reason": string }

Rules:
- Use "embedding" for clear, simple intents that match known patterns
- Use "llm" for ambiguous, complex, or multi-part requests`,
        },
        { role: "user", content: "Write a Python function to sort a list" },
      ],
    },
    expected: {
      schema: {
        type: "object",
        properties: {
          method: { type: "string", enum: ["embedding", "llm"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          reason: { type: "string" },
        },
        required: ["method", "confidence"],
      },
    },
    evaluator: "json_schema",
    weight: 1,
    tags: ["hybrid", "routing-decision"],
  },
  {
    id: "routing.hybrid.complex-query",
    name: "Complex query requires LLM routing",
    input: {
      messages: [
        {
          role: "system",
          content: `You are a routing classifier. Given the user query, decide the routing method.
Output JSON: { "method": "embedding" | "llm", "confidence": 0-1, "reason": string }`,
        },
        {
          role: "user",
          content: "I need help with my React app - it crashes when I search for users, but I also want to understand if this is a common problem with async state updates",
        },
      ],
    },
    expected: {
      contains: ["llm"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["hybrid", "complex"],
  },
];

// =============================================================================
// Exported Benchmark Definitions
// =============================================================================

export const routingBenchmarks: BenchmarkDefinition[] = [
  {
    id: "routing.intent-classification",
    name: "Intent Classification",
    description: "Tests the model's ability to classify user intents for routing to appropriate handlers",
    version: "1.0.0",
    taskType: "routing",
    category: "intent-classification",
    testCases: intentClassificationCases,
    config: {
      maxTokens: 100,
      temperature: 0,
      timeout: 10000,
    },
  },
  {
    id: "routing.hybrid-decision",
    name: "Hybrid Routing Decisions",
    description: "Tests decisions between embedding-based and LLM-based routing",
    version: "1.0.0",
    taskType: "routing",
    category: "hybrid-routing",
    testCases: hybridRoutingCases,
    config: {
      maxTokens: 200,
      temperature: 0,
      timeout: 15000,
    },
  },
];
