/**
 * Function Calling Benchmarks
 *
 * Benchmarks for testing tool/function selection and invocation accuracy.
 */

import type { BenchmarkDefinition, TestCase } from "../../types.js";

// =============================================================================
// Tool Selection Test Cases
// =============================================================================

const toolSelectionCases: TestCase[] = [
  // Clear tool match
  {
    id: "function.selection.weather",
    name: "Weather tool selection",
    input: {
      messages: [
        {
          role: "system",
          content: "You have access to tools. Select the appropriate tool for the user's request.",
        },
        { role: "user", content: "What's the weather like in San Francisco?" },
      ],
      tools: [
        {
          name: "get_weather",
          description: "Get current weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string", description: "City name" },
              units: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
            required: ["location"],
          },
        },
        {
          name: "search_web",
          description: "Search the web for information",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
            required: ["query"],
          },
        },
        {
          name: "send_email",
          description: "Send an email",
          parameters: {
            type: "object",
            properties: {
              to: { type: "string" },
              subject: { type: "string" },
              body: { type: "string" },
            },
            required: ["to", "subject", "body"],
          },
        },
      ],
    },
    expected: {
      functionCall: {
        name: "get_weather",
        arguments: { location: "San Francisco" },
      },
    },
    evaluator: "function_call",
    weight: 1,
    tags: ["tool-selection", "basic"],
  },

  // Multiple viable tools
  {
    id: "function.selection.search-vs-web",
    name: "Database vs web search selection",
    input: {
      messages: [
        {
          role: "system",
          content: "You have access to tools. Select the most appropriate tool.",
        },
        { role: "user", content: "Find all users named John in our system" },
      ],
      tools: [
        {
          name: "search_users",
          description: "Search for users in the internal database",
          parameters: {
            type: "object",
            properties: {
              name: { type: "string" },
              email: { type: "string" },
            },
          },
        },
        {
          name: "search_web",
          description: "Search the public web",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
          },
        },
      ],
    },
    expected: {
      functionCall: {
        name: "search_users",
      },
    },
    evaluator: "function_call",
    weight: 1,
    tags: ["tool-selection", "disambiguation"],
  },

  // Multi-tool scenario
  {
    id: "function.selection.calculator",
    name: "Calculator tool selection",
    input: {
      messages: [
        {
          role: "system",
          content: "You have access to tools. Use them when appropriate.",
        },
        { role: "user", content: "What is 15% of 847?" },
      ],
      tools: [
        {
          name: "calculator",
          description: "Perform mathematical calculations",
          parameters: {
            type: "object",
            properties: {
              expression: { type: "string", description: "Math expression to evaluate" },
            },
            required: ["expression"],
          },
        },
        {
          name: "search_web",
          description: "Search the web",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
          },
        },
      ],
    },
    expected: {
      functionCall: {
        name: "calculator",
      },
    },
    evaluator: "function_call",
    weight: 1,
    tags: ["tool-selection", "math"],
  },

  // No tool needed
  {
    id: "function.selection.no-tool",
    name: "Recognize when no tool is needed",
    input: {
      messages: [
        {
          role: "system",
          content: "You have access to tools. Only use them when necessary. For general knowledge questions, respond directly.",
        },
        { role: "user", content: "What is the capital of France?" },
      ],
      tools: [
        {
          name: "get_weather",
          description: "Get current weather",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
          },
        },
        {
          name: "search_web",
          description: "Search the web for current information",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
            },
          },
        },
      ],
    },
    expected: {
      contains: ["Paris"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["tool-selection", "no-tool"],
  },
];

// =============================================================================
// Parameter Extraction Test Cases
// =============================================================================

const parameterExtractionCases: TestCase[] = [
  // Complex parameter extraction
  {
    id: "function.params.multi-param",
    name: "Multiple parameter extraction",
    input: {
      messages: [
        {
          role: "system",
          content: "Extract the required parameters from the user request and call the appropriate function.",
        },
        {
          role: "user",
          content: "Book a flight from New York to London on March 15th for 2 adults",
        },
      ],
      tools: [
        {
          name: "book_flight",
          description: "Book a flight",
          parameters: {
            type: "object",
            properties: {
              origin: { type: "string", description: "Departure city" },
              destination: { type: "string", description: "Arrival city" },
              date: { type: "string", description: "Travel date (YYYY-MM-DD)" },
              passengers: { type: "integer", description: "Number of passengers" },
            },
            required: ["origin", "destination", "date", "passengers"],
          },
        },
      ],
    },
    expected: {
      functionCall: {
        name: "book_flight",
        arguments: {
          origin: "New York",
          destination: "London",
          passengers: 2,
        },
      },
    },
    evaluator: "function_call",
    weight: 2,
    tags: ["parameters", "extraction"],
  },

  // Implicit parameter inference
  {
    id: "function.params.implicit",
    name: "Implicit parameter inference",
    input: {
      messages: [
        {
          role: "system",
          content: "Extract parameters, inferring reasonable defaults when not explicitly stated.",
        },
        { role: "user", content: "Set a reminder to call mom tomorrow" },
      ],
      tools: [
        {
          name: "create_reminder",
          description: "Create a reminder",
          parameters: {
            type: "object",
            properties: {
              title: { type: "string" },
              datetime: { type: "string", description: "ISO datetime" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
            },
            required: ["title", "datetime"],
          },
        },
      ],
    },
    expected: {
      functionCall: {
        name: "create_reminder",
        arguments: {
          title: "call mom",
        },
      },
    },
    evaluator: "function_call",
    weight: 1,
    tags: ["parameters", "inference"],
  },

  // Nested/complex parameters
  {
    id: "function.params.nested",
    name: "Nested parameter structure",
    input: {
      messages: [
        {
          role: "system",
          content: "Parse the request into the correct parameter structure.",
        },
        {
          role: "user",
          content: "Create a new user with name John Doe, email john@example.com, and admin role",
        },
      ],
      tools: [
        {
          name: "create_user",
          description: "Create a new user",
          parameters: {
            type: "object",
            properties: {
              user: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  email: { type: "string" },
                  role: { type: "string", enum: ["user", "admin", "moderator"] },
                },
                required: ["name", "email"],
              },
            },
            required: ["user"],
          },
        },
      ],
    },
    expected: {
      functionCall: {
        name: "create_user",
        arguments: {
          user: {
            name: "John Doe",
            email: "john@example.com",
            role: "admin",
          },
        },
      },
    },
    evaluator: "function_call",
    weight: 2,
    tags: ["parameters", "nested"],
  },
];

// =============================================================================
// Multi-Tool Orchestration Test Cases
// =============================================================================

const multiToolCases: TestCase[] = [
  // Sequential tool use
  {
    id: "function.multi.sequential",
    name: "Sequential tool orchestration",
    input: {
      messages: [
        {
          role: "system",
          content: "You can use multiple tools. Plan and execute the steps needed.",
        },
        {
          role: "user",
          content: "Find the weather in Tokyo and convert the temperature to Fahrenheit",
        },
      ],
      tools: [
        {
          name: "get_weather",
          description: "Get weather (returns Celsius)",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
          },
        },
        {
          name: "convert_temperature",
          description: "Convert temperature between units",
          parameters: {
            type: "object",
            properties: {
              value: { type: "number" },
              from: { type: "string", enum: ["celsius", "fahrenheit"] },
              to: { type: "string", enum: ["celsius", "fahrenheit"] },
            },
          },
        },
      ],
    },
    expected: {
      functionCall: {
        name: "get_weather",
        arguments: { location: "Tokyo" },
      },
    },
    evaluator: "function_call",
    weight: 2,
    tags: ["multi-tool", "sequential"],
  },

  // Parallel tool use
  {
    id: "function.multi.parallel",
    name: "Parallel tool invocation",
    input: {
      messages: [
        {
          role: "system",
          content: "You can call multiple tools in parallel when they don't depend on each other.",
        },
        {
          role: "user",
          content: "What's the weather in both New York and Los Angeles?",
        },
      ],
      tools: [
        {
          name: "get_weather",
          description: "Get weather for a location",
          parameters: {
            type: "object",
            properties: {
              location: { type: "string" },
            },
          },
        },
      ],
    },
    expected: {
      contains: ["New York", "Los Angeles"],
    },
    evaluator: "contains",
    weight: 2,
    tags: ["multi-tool", "parallel"],
  },
];

// =============================================================================
// Exported Benchmark Definitions
// =============================================================================

export const functionCallingBenchmarks: BenchmarkDefinition[] = [
  {
    id: "function_calling.tool-selection",
    name: "Tool Selection",
    description: "Tests the model's ability to select the correct tool for a task",
    version: "1.0.0",
    taskType: "function_calling",
    category: "tool-selection",
    testCases: toolSelectionCases,
    config: {
      maxTokens: 300,
      temperature: 0,
      timeout: 15000,
    },
  },
  {
    id: "function_calling.parameter-extraction",
    name: "Parameter Extraction",
    description: "Tests accurate extraction of function parameters from natural language",
    version: "1.0.0",
    taskType: "function_calling",
    category: "parameter-extraction",
    testCases: parameterExtractionCases,
    config: {
      maxTokens: 400,
      temperature: 0,
      timeout: 15000,
    },
  },
  {
    id: "function_calling.multi-tool",
    name: "Multi-Tool Orchestration",
    description: "Tests ability to orchestrate multiple tools",
    version: "1.0.0",
    taskType: "function_calling",
    category: "multi-tool",
    testCases: multiToolCases,
    config: {
      maxTokens: 500,
      temperature: 0,
      timeout: 20000,
    },
  },
];
