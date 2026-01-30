/**
 * SQL schema for pg-mem in-memory database
 */
export const MEMORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS integration_execution_logs (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    provider TEXT NOT NULL,
    operation TEXT NOT NULL,
    model TEXT,
    request_id VARCHAR(255) NOT NULL,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    duration_ms INTEGER,
    success BOOLEAN NOT NULL,
    error_message TEXT,
    prompt_tokens INTEGER,
    completion_tokens INTEGER,
    total_tokens INTEGER,
    estimated_cost_cents INTEGER,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_execution_logs_user_id ON integration_execution_logs(user_id);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_org_id ON integration_execution_logs(org_id);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_provider ON integration_execution_logs(provider);
  CREATE INDEX IF NOT EXISTS idx_execution_logs_created ON integration_execution_logs(created_at);

  -- Model Evaluations table
  CREATE TABLE IF NOT EXISTS model_evaluations (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    benchmark_id VARCHAR(255) NOT NULL,
    benchmark_version VARCHAR(50) NOT NULL,
    overall_score REAL NOT NULL,
    accuracy REAL NOT NULL,
    latency_p50_ms INTEGER NOT NULL,
    latency_p95_ms INTEGER NOT NULL,
    latency_p99_ms INTEGER,
    total_input_tokens INTEGER NOT NULL,
    total_output_tokens INTEGER NOT NULL,
    estimated_cost_cents REAL NOT NULL,
    test_case_results JSON NOT NULL,
    run_config JSON NOT NULL,
    org_id VARCHAR(100),
    scope VARCHAR(20) NOT NULL DEFAULT 'global',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    error_message TEXT,
    started_at TIMESTAMP NOT NULL,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_model_evaluations_provider ON model_evaluations(provider);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_model ON model_evaluations(model_id);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_benchmark ON model_evaluations(benchmark_id);
  CREATE INDEX IF NOT EXISTS idx_model_evaluations_status ON model_evaluations(status);

  -- Model Scores table (aggregated)
  CREATE TABLE IF NOT EXISTS model_scores (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100) NOT NULL,
    model_id VARCHAR(255) NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    quality_score REAL NOT NULL,
    speed_score REAL NOT NULL,
    cost_score REAL NOT NULL,
    reliability_score REAL NOT NULL,
    composite_score REAL NOT NULL,
    evaluation_ids JSON NOT NULL DEFAULT '[]',
    org_id VARCHAR(100),
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    UNIQUE(provider, model_id, task_type)
  );

  CREATE INDEX IF NOT EXISTS idx_model_scores_provider ON model_scores(provider);
  CREATE INDEX IF NOT EXISTS idx_model_scores_task_type ON model_scores(task_type);
  CREATE INDEX IF NOT EXISTS idx_model_scores_composite ON model_scores(composite_score);

  -- Model Recommendations cache
  CREATE TABLE IF NOT EXISTS model_recommendations (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    task_type VARCHAR(50) NOT NULL,
    constraints JSON,
    recommendations JSON NOT NULL,
    cache_key VARCHAR(255) NOT NULL UNIQUE,
    org_id VARCHAR(100),
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_model_recommendations_task_type ON model_recommendations(task_type);
  CREATE INDEX IF NOT EXISTS idx_model_recommendations_cache_key ON model_recommendations(cache_key);
  CREATE INDEX IF NOT EXISTS idx_model_recommendations_expires ON model_recommendations(expires_at);

  -- Benchmark Definitions table
  CREATE TABLE IF NOT EXISTS benchmark_definitions (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    task_type VARCHAR(50) NOT NULL,
    category VARCHAR(100) NOT NULL,
    test_cases JSON NOT NULL,
    config JSON,
    author VARCHAR(255),
    is_builtin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_benchmark_definitions_task_type ON benchmark_definitions(task_type);
  CREATE INDEX IF NOT EXISTS idx_benchmark_definitions_category ON benchmark_definitions(category);

  -- Evaluation Schedules table
  CREATE TABLE IF NOT EXISTS evaluation_schedules (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    provider VARCHAR(100),
    model_id VARCHAR(255),
    benchmark_id VARCHAR(255),
    task_type VARCHAR(50),
    cron_expression VARCHAR(100) NOT NULL,
    interval_hours INTEGER,
    enabled BOOLEAN NOT NULL DEFAULT true,
    last_run_at TIMESTAMP,
    next_run_at TIMESTAMP,
    last_error TEXT,
    org_id VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_evaluation_schedules_enabled ON evaluation_schedules(enabled);
  CREATE INDEX IF NOT EXISTS idx_evaluation_schedules_next_run ON evaluation_schedules(next_run_at);

  -- Channel Connections table (for multi-channel messaging)
  CREATE TABLE IF NOT EXISTS channel_connections (
    id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
    integration_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    org_id VARCHAR(255),
    channel_type VARCHAR(50) NOT NULL,
    channel_account_id VARCHAR(255),
    channel_account_name VARCHAR(255),
    credential_id VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    session_data JSON DEFAULT '{}',
    qr_code TEXT,
    qr_expires_at TIMESTAMP,
    qr_attempts INTEGER DEFAULT 0,
    webhook_url TEXT,
    webhook_secret TEXT,
    webhook_verified BOOLEAN DEFAULT false,
    last_ping_at TIMESTAMP,
    last_message_at TIMESTAMP,
    last_error_at TIMESTAMP,
    last_error TEXT,
    error_count INTEGER DEFAULT 0,
    consecutive_errors INTEGER DEFAULT 0,
    messages_received INTEGER DEFAULT 0,
    messages_sent INTEGER DEFAULT 0,
    metadata JSON DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    connected_at TIMESTAMP,
    disconnected_at TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_channel_connections_user_id ON channel_connections(user_id);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_org_id ON channel_connections(org_id);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_channel_type ON channel_connections(channel_type);
  CREATE INDEX IF NOT EXISTS idx_channel_connections_status ON channel_connections(status);
`;
