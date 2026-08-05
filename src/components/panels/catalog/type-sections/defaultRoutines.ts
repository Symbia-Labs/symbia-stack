/**
 * Default Routines for Assistants
 *
 * Pre-configured routines for each assistant type.
 * These serve as starting templates that users can customize.
 */

import type { Routine } from './RoutineEditor';

// Default routines mapped by assistant alias
export const DEFAULT_ROUTINES: Record<string, Routine[]> = {
  // Log Analyst - Analyzes logs, finds errors, provides insights
  logs: [
    {
      id: 'routine-logs-main',
      name: 'Analyze Logs',
      trigger: 'When user asks about logs or errors',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'think', description: 'Understand what the user is looking for - errors, patterns, timeframes' },
        { id: 'step-2', type: 'recall', description: '@logs.recent to get the latest log entries' },
        { id: 'step-3', type: 'check', description: 'user mentioned a specific error or service' },
        { id: 'step-4', type: 'call', description: 'Run Search Specific routine', params: { routineName: 'Search Specific' } },
        { id: 'step-5', type: 'think', description: 'Identify patterns, anomalies, and root causes' },
        { id: 'step-6', type: 'say', description: 'Summarize findings with severity levels and recommendations' },
      ],
    },
    {
      id: 'routine-logs-search',
      name: 'Search Specific',
      steps: [
        { id: 'step-1', type: 'recall', description: '@logs.query with the user\'s search terms' },
        { id: 'step-2', type: 'think', description: 'Filter and rank results by relevance' },
        { id: 'step-3', type: 'remember', description: 'searchResults: the filtered log entries' },
      ],
    },
    {
      id: 'routine-logs-alert',
      name: 'Check Alerts',
      trigger: 'When user asks about alerts or critical issues',
      steps: [
        { id: 'step-1', type: 'recall', description: '@alerts.active to get current alerts' },
        { id: 'step-2', type: 'check', description: 'there are critical or high severity alerts' },
        { id: 'step-3', type: 'say', description: 'List critical alerts first with impact assessment' },
        { id: 'step-4', type: 'ask', description: 'Would you like me to investigate any of these further?' },
      ],
    },
  ],

  // Catalog Search - Searches and discovers resources in the catalog
  catalog: [
    {
      id: 'routine-catalog-main',
      name: 'Search Catalog',
      trigger: 'When user asks to find resources or capabilities',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'think', description: 'Parse the user\'s query for resource types, tags, and keywords' },
        { id: 'step-2', type: 'recall', description: '@catalog.search with extracted search terms' },
        { id: 'step-3', type: 'check', description: 'results were found' },
        { id: 'step-4', type: 'say', description: 'Present matching resources with descriptions and usage hints' },
        { id: 'step-5', type: 'check', description: 'no results found' },
        { id: 'step-6', type: 'call', description: 'Run Suggest Alternatives routine', params: { routineName: 'Suggest Alternatives' } },
      ],
    },
    {
      id: 'routine-catalog-suggest',
      name: 'Suggest Alternatives',
      steps: [
        { id: 'step-1', type: 'recall', description: '@catalog.similar to find related resources' },
        { id: 'step-2', type: 'think', description: 'Rank alternatives by relevance to user intent' },
        { id: 'step-3', type: 'say', description: 'Suggest similar resources or capabilities that might help' },
        { id: 'step-4', type: 'ask', description: 'Would any of these work for your use case?' },
      ],
    },
    {
      id: 'routine-catalog-explain',
      name: 'Explain Resource',
      trigger: 'When user asks what a resource does',
      steps: [
        { id: 'step-1', type: 'recall', description: '@catalog.get with the resource key' },
        { id: 'step-2', type: 'think', description: 'Summarize purpose, inputs, outputs, and common use cases' },
        { id: 'step-3', type: 'say', description: 'Explain the resource with examples of how to use it' },
      ],
    },
  ],

  // Run Debugger - Debugs and analyzes workflow runs
  debug: [
    {
      id: 'routine-debug-main',
      name: 'Debug Run',
      trigger: 'When user reports a failed or problematic run',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'ask', description: 'Can you share the run ID or describe what happened?' },
        { id: 'step-2', type: 'recall', description: '@runs.get with the run ID' },
        { id: 'step-3', type: 'think', description: 'Analyze the execution trace, inputs, and failure point' },
        { id: 'step-4', type: 'call', description: 'Run Identify Root Cause routine', params: { routineName: 'Identify Root Cause' } },
        { id: 'step-5', type: 'say', description: 'Explain what went wrong and suggest fixes' },
      ],
    },
    {
      id: 'routine-debug-root',
      name: 'Identify Root Cause',
      steps: [
        { id: 'step-1', type: 'recall', description: '@runs.trace to get detailed execution steps' },
        { id: 'step-2', type: 'think', description: 'Walk through each step to find where it diverged from expected' },
        { id: 'step-3', type: 'check', description: 'error was in input validation' },
        { id: 'step-4', type: 'remember', description: 'rootCause: input validation failure with details' },
        { id: 'step-5', type: 'check', description: 'error was in external service' },
        { id: 'step-6', type: 'remember', description: 'rootCause: external service failure with error code' },
      ],
    },
    {
      id: 'routine-debug-compare',
      name: 'Compare Runs',
      trigger: 'When user wants to compare successful vs failed runs',
      steps: [
        { id: 'step-1', type: 'recall', description: '@runs.compare with both run IDs' },
        { id: 'step-2', type: 'think', description: 'Diff the inputs, outputs, and execution paths' },
        { id: 'step-3', type: 'say', description: 'Highlight differences that likely caused the failure' },
      ],
    },
  ],

  // Usage Reporter - Provides usage analytics and reporting
  usage: [
    {
      id: 'routine-usage-main',
      name: 'Report Usage',
      trigger: 'When user asks about usage, metrics, or analytics',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'think', description: 'Determine what metrics the user wants - API calls, costs, errors' },
        { id: 'step-2', type: 'recall', description: '@metrics.summary for the requested time period' },
        { id: 'step-3', type: 'think', description: 'Identify trends, anomalies, and notable changes' },
        { id: 'step-4', type: 'say', description: 'Present usage summary with charts and insights' },
        { id: 'step-5', type: 'ask', description: 'Want me to break this down by service or time period?' },
      ],
    },
    {
      id: 'routine-usage-costs',
      name: 'Analyze Costs',
      trigger: 'When user asks about spending or costs',
      steps: [
        { id: 'step-1', type: 'recall', description: '@billing.summary for current period' },
        { id: 'step-2', type: 'think', description: 'Break down costs by service, model, and usage type' },
        { id: 'step-3', type: 'check', description: 'costs are trending higher than usual' },
        { id: 'step-4', type: 'say', description: 'Alert: costs are X% higher than last period, here\'s why...' },
        { id: 'step-5', type: 'say', description: 'Present cost breakdown with recommendations for optimization' },
      ],
    },
    {
      id: 'routine-usage-export',
      name: 'Export Report',
      trigger: 'When user wants to export or download usage data',
      steps: [
        { id: 'step-1', type: 'ask', description: 'What format would you like? CSV, JSON, or PDF?' },
        { id: 'step-2', type: 'recall', description: '@metrics.export with format and date range' },
        { id: 'step-3', type: 'say', description: 'Here\'s your report: [download link]' },
      ],
    },
  ],

  // Onboarding - Helps new users get started
  welcome: [
    {
      id: 'routine-welcome-main',
      name: 'Welcome User',
      trigger: 'When a new user joins or asks for help getting started',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'say', description: 'Welcome to Symbia! I\'m here to help you get started.' },
        { id: 'step-2', type: 'recall', description: '@user.profile to check their role and permissions' },
        { id: 'step-3', type: 'think', description: 'Customize onboarding based on their role' },
        { id: 'step-4', type: 'call', description: 'Run Show Getting Started routine', params: { routineName: 'Show Getting Started' } },
        { id: 'step-5', type: 'ask', description: 'What would you like to explore first?' },
      ],
    },
    {
      id: 'routine-welcome-start',
      name: 'Show Getting Started',
      steps: [
        { id: 'step-1', type: 'say', description: 'Here are the key things you can do:' },
        { id: 'step-2', type: 'say', description: '1. Chat with AI assistants using @mentions' },
        { id: 'step-3', type: 'say', description: '2. Browse the Catalog to find tools and integrations' },
        { id: 'step-4', type: 'say', description: '3. Check Logs to monitor system activity' },
        { id: 'step-5', type: 'say', description: '4. Build custom assistants in Resources' },
      ],
    },
    {
      id: 'routine-welcome-tour',
      name: 'Interactive Tour',
      trigger: 'When user asks for a tour or walkthrough',
      steps: [
        { id: 'step-1', type: 'say', description: 'Let me give you a quick tour!' },
        { id: 'step-2', type: 'say', description: 'First, try the Chat panel - type @logs to talk to the Log Analyst' },
        { id: 'step-3', type: 'wait', params: { duration: 3000 }, description: 'Wait for user to try it' },
        { id: 'step-4', type: 'ask', description: 'How did that go? Ready to explore more?' },
      ],
    },
    {
      id: 'routine-welcome-help',
      name: 'Answer Questions',
      trigger: 'When user asks how to do something',
      steps: [
        { id: 'step-1', type: 'think', description: 'Identify what the user is trying to accomplish' },
        { id: 'step-2', type: 'recall', description: '@docs.search for relevant help articles' },
        { id: 'step-3', type: 'say', description: 'Here\'s how to do that: [step by step instructions]' },
        { id: 'step-4', type: 'ask', description: 'Did that help? Need me to clarify anything?' },
      ],
    },
  ],

  // CLI Assistant - Generates CLI commands from natural language
  cli: [
    {
      id: 'routine-cli-main',
      name: 'Generate Command',
      trigger: 'When user describes what they want to do',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'think', description: 'Parse the user\'s intent and map to CLI commands' },
        { id: 'step-2', type: 'recall', description: '@cli.commands to get available commands and syntax' },
        { id: 'step-3', type: 'think', description: 'Build the command with correct flags and arguments' },
        { id: 'step-4', type: 'say', description: 'Here\'s the command: `symbia [command]`' },
        { id: 'step-5', type: 'ask', description: 'Want me to explain what each part does?' },
      ],
    },
    {
      id: 'routine-cli-explain',
      name: 'Explain Command',
      trigger: 'When user asks what a command does',
      steps: [
        { id: 'step-1', type: 'recall', description: '@cli.help for the specified command' },
        { id: 'step-2', type: 'think', description: 'Break down each flag and argument' },
        { id: 'step-3', type: 'say', description: 'Explain the command in plain English with examples' },
      ],
    },
    {
      id: 'routine-cli-script',
      name: 'Generate Script',
      trigger: 'When user needs multiple commands or automation',
      steps: [
        { id: 'step-1', type: 'think', description: 'Understand the full workflow the user wants to automate' },
        { id: 'step-2', type: 'recall', description: '@cli.commands for all relevant commands' },
        { id: 'step-3', type: 'think', description: 'Chain commands with proper error handling' },
        { id: 'step-4', type: 'say', description: 'Here\'s a script that does what you need:' },
        { id: 'step-5', type: 'say', description: '```bash\n#!/bin/bash\n# [generated script]\n```' },
        { id: 'step-6', type: 'ask', description: 'Should I add error handling or make it interactive?' },
      ],
    },
    {
      id: 'routine-cli-fix',
      name: 'Fix Command Error',
      trigger: 'When user shares an error from running a command',
      steps: [
        { id: 'step-1', type: 'think', description: 'Parse the error message to identify the issue' },
        { id: 'step-2', type: 'check', description: 'error is a syntax issue' },
        { id: 'step-3', type: 'say', description: 'The syntax issue is [X]. Here\'s the corrected command:' },
        { id: 'step-4', type: 'check', description: 'error is a permission or auth issue' },
        { id: 'step-5', type: 'say', description: 'You need to authenticate first. Run: `symbia auth login`' },
        { id: 'step-6', type: 'say', description: 'Here\'s the fixed command with explanation' },
      ],
    },
  ],

  // Assistants Assistant - Helps create and configure new assistants
  builder: [
    {
      id: 'routine-builder-main',
      name: 'Create Assistant',
      trigger: 'When user wants to create a new assistant',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'say', description: 'I\'ll help you create a new assistant! Let\'s start with the basics.' },
        { id: 'step-2', type: 'ask', description: 'What should this assistant do? Describe its main purpose.' },
        { id: 'step-3', type: 'think', description: 'Map the user\'s description to appropriate capabilities and services' },
        { id: 'step-4', type: 'recall', description: '@catalog.assistants to find similar assistants for reference' },
        { id: 'step-5', type: 'call', description: 'Run Design Rules routine', params: { routineName: 'Design Rules' } },
        { id: 'step-6', type: 'say', description: 'Here\'s the assistant configuration I\'ve designed:' },
        { id: 'step-7', type: 'ask', description: 'Would you like to customize any of these settings?' },
      ],
    },
    {
      id: 'routine-builder-rules',
      name: 'Design Rules',
      steps: [
        { id: 'step-1', type: 'think', description: 'Identify triggers: what events should activate this assistant?' },
        { id: 'step-2', type: 'think', description: 'Define conditions: when should each rule apply?' },
        { id: 'step-3', type: 'think', description: 'Plan actions: service calls, LLM invocations, messages' },
        { id: 'step-4', type: 'remember', description: 'ruleSet: the complete rule configuration' },
      ],
    },
    {
      id: 'routine-builder-explain',
      name: 'Explain Assistant Architecture',
      trigger: 'When user asks how assistants work',
      steps: [
        { id: 'step-1', type: 'say', description: 'Assistants are built with a rule-based architecture:' },
        { id: 'step-2', type: 'say', description: '**Rules** have triggers (events), conditions (when to act), and actions (what to do)' },
        { id: 'step-3', type: 'say', description: '**Actions** can call services, invoke LLMs, or send messages' },
        { id: 'step-4', type: 'say', description: '**@mentions** let users directly invoke assistants in chat' },
        { id: 'step-5', type: 'ask', description: 'Want to see an example or start building one?' },
      ],
    },
    {
      id: 'routine-builder-list',
      name: 'List Assistants',
      trigger: 'When user asks what assistants exist',
      steps: [
        { id: 'step-1', type: 'recall', description: '@catalog.assistants to get all available assistants' },
        { id: 'step-2', type: 'think', description: 'Group assistants by category and capability' },
        { id: 'step-3', type: 'say', description: 'Here are the available assistants with their @mentions and capabilities' },
      ],
    },
  ],

  // Code Agent - Helps with code operations and development tasks
  code: [
    {
      id: 'routine-code-main',
      name: 'Analyze Code',
      trigger: 'When user asks about code or files',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'think', description: 'Understand what the user wants: analysis, generation, or modification' },
        { id: 'step-2', type: 'recall', description: '@code.context to get relevant code context' },
        { id: 'step-3', type: 'check', description: 'user wants code generation' },
        { id: 'step-4', type: 'call', description: 'Run Generate Code routine', params: { routineName: 'Generate Code' } },
        { id: 'step-5', type: 'think', description: 'Analyze the code for patterns, issues, or improvements' },
        { id: 'step-6', type: 'say', description: 'Provide analysis with specific line references and recommendations' },
      ],
    },
    {
      id: 'routine-code-generate',
      name: 'Generate Code',
      steps: [
        { id: 'step-1', type: 'think', description: 'Understand requirements, language, and coding conventions' },
        { id: 'step-2', type: 'recall', description: '@code.style to get project coding standards' },
        { id: 'step-3', type: 'think', description: 'Generate clean, well-documented code following conventions' },
        { id: 'step-4', type: 'say', description: 'Here\'s the generated code with explanation:' },
        { id: 'step-5', type: 'ask', description: 'Should I add tests or documentation?' },
      ],
    },
    {
      id: 'routine-code-review',
      name: 'Review Code',
      trigger: 'When user asks for a code review',
      steps: [
        { id: 'step-1', type: 'recall', description: '@code.diff to get the changes' },
        { id: 'step-2', type: 'think', description: 'Check for bugs, security issues, and best practices' },
        { id: 'step-3', type: 'say', description: 'Code review findings organized by severity' },
        { id: 'step-4', type: 'say', description: 'Suggestions for improvements with code examples' },
      ],
    },
  ],

  // Coordinator - Routes messages to appropriate specialist assistants
  help: [
    {
      id: 'routine-help-main',
      name: 'Route Request',
      trigger: 'When user asks a general question',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'think', description: 'Analyze the user\'s request to understand their intent' },
        { id: 'step-2', type: 'recall', description: '@catalog.assistants to get available specialists' },
        { id: 'step-3', type: 'check', description: 'request is about logs or errors' },
        { id: 'step-4', type: 'say', description: 'This sounds like a job for @logs - they can analyze logs and find errors' },
        { id: 'step-5', type: 'check', description: 'request is about debugging or failed runs' },
        { id: 'step-6', type: 'say', description: 'Let me connect you with @debug - they specialize in debugging workflow runs' },
        { id: 'step-7', type: 'check', description: 'request is about building assistants' },
        { id: 'step-8', type: 'say', description: '@builder can help you create and configure new assistants' },
        { id: 'step-9', type: 'say', description: 'I\'ve analyzed your request. Here\'s who can help and why:' },
      ],
    },
    {
      id: 'routine-help-discover',
      name: 'Discover Assistants',
      trigger: 'When user asks what assistants are available',
      steps: [
        { id: 'step-1', type: 'recall', description: '@catalog.assistants to get all assistants' },
        { id: 'step-2', type: 'say', description: 'Here are the available assistants:' },
        { id: 'step-3', type: 'say', description: '@logs - Log analysis and error finding' },
        { id: 'step-4', type: 'say', description: '@debug - Workflow run debugging' },
        { id: 'step-5', type: 'say', description: '@usage - Usage metrics and analytics' },
        { id: 'step-6', type: 'say', description: '@catalog - Search for resources' },
        { id: 'step-7', type: 'say', description: '@builder - Create new assistants' },
        { id: 'step-8', type: 'say', description: '@code - Code analysis and generation' },
        { id: 'step-9', type: 'ask', description: 'Which one would you like to try?' },
      ],
    },
  ],

  // Test Assistant - Minimal assistant for end-to-end testing
  test: [
    {
      id: 'routine-test-main',
      name: 'Test Response',
      trigger: 'When user sends any message',
      isMain: true,
      steps: [
        { id: 'step-1', type: 'say', description: 'Test assistant received your message' },
        { id: 'step-2', type: 'think', description: 'Echo the message for verification' },
        { id: 'step-3', type: 'say', description: 'Response complete. Status: OK' },
      ],
    },
  ],
};

/**
 * Get default routines for an assistant by alias
 */
export function getDefaultRoutines(alias: string | undefined): Routine[] {
  if (!alias) return [];
  return DEFAULT_ROUTINES[alias] || [];
}

/**
 * Check if an assistant has custom routines or is using defaults
 */
export function hasCustomRoutines(routines: Routine[], alias: string | undefined): boolean {
  const defaults = getDefaultRoutines(alias);
  if (routines.length === 0) return false;
  if (defaults.length === 0) return routines.length > 0;
  // Simple check - if IDs match, they're using defaults
  return !routines.every(r => defaults.some(d => d.id === r.id));
}
