/**
 * Reasoning Benchmarks
 *
 * Benchmarks for complex reasoning, fact-checking, and logical analysis.
 */

import type { BenchmarkDefinition, TestCase } from "../../types.js";

// =============================================================================
// Fact Checking Test Cases
// =============================================================================

const factCheckingCases: TestCase[] = [
  // Clear true claims
  {
    id: "reasoning.fact.earth-sun",
    name: "Basic astronomical fact",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a fact-checker. Analyze the claim and respond with JSON: { \"verdict\": \"true\" | \"false\" | \"partially_true\" | \"unverifiable\", \"confidence\": 0-1, \"explanation\": string }",
        },
        {
          role: "user",
          content: "Claim: The Earth orbits the Sun.",
        },
      ],
    },
    expected: {
      contains: ["true"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["fact-check", "easy"],
  },

  // Clear false claims
  {
    id: "reasoning.fact.great-wall-space",
    name: "Common misconception",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a fact-checker. Analyze the claim and respond with JSON: { \"verdict\": \"true\" | \"false\" | \"partially_true\" | \"unverifiable\", \"confidence\": 0-1, \"explanation\": string }",
        },
        {
          role: "user",
          content: "Claim: The Great Wall of China is visible from space with the naked eye.",
        },
      ],
    },
    expected: {
      contains: ["false"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["fact-check", "misconception"],
  },

  // Nuanced claims
  {
    id: "reasoning.fact.goldfish-memory",
    name: "Partially true claim",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a fact-checker. Analyze the claim carefully. Respond with JSON: { \"verdict\": \"true\" | \"false\" | \"partially_true\" | \"unverifiable\", \"confidence\": 0-1, \"explanation\": string }",
        },
        {
          role: "user",
          content: "Claim: Goldfish have a 3-second memory.",
        },
      ],
    },
    expected: {
      contains: ["false"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["fact-check", "nuanced"],
  },

  // Technical claims
  {
    id: "reasoning.fact.http-secure",
    name: "Technical security claim",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a technical fact-checker. Analyze the claim. Respond with JSON: { \"verdict\": \"true\" | \"false\" | \"partially_true\" | \"unverifiable\", \"confidence\": 0-1, \"explanation\": string }",
        },
        {
          role: "user",
          content: "Claim: HTTPS guarantees that a website is trustworthy and safe to use.",
        },
      ],
    },
    expected: {
      contains: ["false", "partially"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["fact-check", "technical", "security"],
  },
];

// =============================================================================
// Logical Reasoning Test Cases
// =============================================================================

const logicalReasoningCases: TestCase[] = [
  // Syllogism
  {
    id: "reasoning.logic.syllogism",
    name: "Basic syllogism",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a logic expert. Analyze the argument and determine if the conclusion follows. Respond with JSON: { \"valid\": boolean, \"explanation\": string }",
        },
        {
          role: "user",
          content: "Premises: All dogs are mammals. All mammals are animals. Conclusion: All dogs are animals.",
        },
      ],
    },
    expected: {
      contains: ["valid", "true"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["logic", "syllogism"],
  },

  // Invalid syllogism
  {
    id: "reasoning.logic.invalid-syllogism",
    name: "Invalid syllogism detection",
    input: {
      messages: [
        {
          role: "system",
          content: "You are a logic expert. Analyze the argument and determine if the conclusion follows. Respond with JSON: { \"valid\": boolean, \"explanation\": string }",
        },
        {
          role: "user",
          content: "Premises: All cats are animals. Some animals are dogs. Conclusion: Some cats are dogs.",
        },
      ],
    },
    expected: {
      contains: ["false", "invalid"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["logic", "syllogism", "fallacy"],
  },

  // Conditional reasoning
  {
    id: "reasoning.logic.modus-ponens",
    name: "Modus ponens",
    input: {
      messages: [
        {
          role: "system",
          content: "Analyze this logical argument. Is the conclusion valid? Respond with JSON: { \"valid\": boolean, \"rule\": string, \"explanation\": string }",
        },
        {
          role: "user",
          content: "If it rains, the ground gets wet. It is raining. Therefore, the ground is wet.",
        },
      ],
    },
    expected: {
      contains: ["valid", "true", "modus ponens"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["logic", "conditional"],
  },

  // Affirming the consequent (fallacy)
  {
    id: "reasoning.logic.affirming-consequent",
    name: "Affirming the consequent fallacy",
    input: {
      messages: [
        {
          role: "system",
          content: "Analyze this logical argument. Is the conclusion valid? Identify any fallacies. Respond with JSON: { \"valid\": boolean, \"fallacy\": string | null, \"explanation\": string }",
        },
        {
          role: "user",
          content: "If it rains, the ground gets wet. The ground is wet. Therefore, it rained.",
        },
      ],
    },
    expected: {
      contains: ["false", "invalid", "fallacy", "affirming"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["logic", "fallacy", "conditional"],
  },
];

// =============================================================================
// Multi-Step Reasoning Test Cases
// =============================================================================

const multiStepReasoningCases: TestCase[] = [
  // Math word problem
  {
    id: "reasoning.multi.age-problem",
    name: "Age-based word problem",
    input: {
      messages: [
        {
          role: "system",
          content: "Solve this problem step by step and provide the final answer.",
        },
        {
          role: "user",
          content: "Alice is twice as old as Bob. In 10 years, Alice will be 1.5 times as old as Bob. How old is Alice now?",
        },
      ],
    },
    expected: {
      contains: ["20"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["reasoning", "math", "multi-step"],
  },

  // Sequential dependencies
  {
    id: "reasoning.multi.meeting-schedule",
    name: "Meeting scheduling logic",
    input: {
      messages: [
        {
          role: "system",
          content: "Analyze the scheduling constraints and determine if the meeting can happen. Explain your reasoning step by step.",
        },
        {
          role: "user",
          content: "Alice is free 9-11am and 2-4pm. Bob is free 10am-1pm. Charlie is free 11am-3pm. Can they all meet for 1 hour? If so, when?",
        },
      ],
    },
    expected: {
      contains: ["11", "12", "yes"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["reasoning", "scheduling", "constraints"],
  },

  // Causal chain
  {
    id: "reasoning.multi.causal-chain",
    name: "Causal chain analysis",
    input: {
      messages: [
        {
          role: "system",
          content: "Analyze the causal chain and identify the root cause.",
        },
        {
          role: "user",
          content: "The website went down. Investigation revealed: The server ran out of memory. The memory was consumed by the database. The database had a runaway query. The query was triggered by a bug in the user search feature. The bug was introduced in last week's deployment. What is the root cause?",
        },
      ],
    },
    expected: {
      contains: ["bug", "deployment", "search"],
    },
    evaluator: "contains",
    weight: 1,
    tags: ["reasoning", "causal", "debugging"],
  },
];

// =============================================================================
// Exported Benchmark Definitions
// =============================================================================

export const reasoningBenchmarks: BenchmarkDefinition[] = [
  {
    id: "reasoning.fact-checking",
    name: "Fact Checking",
    description: "Tests the model's ability to verify factual claims",
    version: "1.0.0",
    taskType: "reasoning",
    category: "fact-checking",
    testCases: factCheckingCases,
    config: {
      maxTokens: 300,
      temperature: 0,
      timeout: 15000,
    },
  },
  {
    id: "reasoning.logical-analysis",
    name: "Logical Analysis",
    description: "Tests formal logic and fallacy detection",
    version: "1.0.0",
    taskType: "reasoning",
    category: "logic",
    testCases: logicalReasoningCases,
    config: {
      maxTokens: 400,
      temperature: 0,
      timeout: 15000,
    },
  },
  {
    id: "reasoning.multi-step",
    name: "Multi-Step Reasoning",
    description: "Tests complex reasoning requiring multiple steps",
    version: "1.0.0",
    taskType: "reasoning",
    category: "multi-step",
    testCases: multiStepReasoningCases,
    config: {
      maxTokens: 500,
      temperature: 0,
      timeout: 20000,
    },
  },
];
