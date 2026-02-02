# Symbia Stack - ECS Task Definitions and Services

locals {
  ecr_url = "${data.aws_caller_identity.current.account_id}.dkr.ecr.${var.aws_region}.amazonaws.com"

  # Common environment variables for all services
  common_env = [
    {
      name  = "NODE_ENV"
      value = "production"
    },
    {
      name  = "HOST"
      value = "0.0.0.0"
    }
  ]

  # Service URLs using Cloud Map service discovery
  service_urls = {
    IDENTITY_SERVICE_URL     = "http://identity.symbia.local:5001"
    LOGGING_SERVICE_URL      = "http://logging.symbia.local:5002"
    CATALOG_SERVICE_URL      = "http://catalog.symbia.local:5003"
    ASSISTANTS_SERVICE_URL   = "http://assistants.symbia.local:5004"
    MESSAGING_SERVICE_URL    = "http://messaging.symbia.local:5005"
    RUNTIME_SERVICE_URL      = "http://runtime.symbia.local:5006"
    INTEGRATIONS_SERVICE_URL = "http://integrations.symbia.local:5007"
    MODELS_SERVICE_URL       = "http://models.symbia.local:5008"
    NETWORK_SERVICE_URL      = "http://network.symbia.local:5054"
  }

  # Convert service URLs to env format
  service_url_env = [
    for k, v in local.service_urls : {
      name  = k
      value = v
    }
  ]
}

# =============================================================================
# Task Definitions
# =============================================================================

# Identity Service
resource "aws_ecs_task_definition" "identity" {
  family                   = "${local.name_prefix}-identity"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = local.services.identity.cpu
  memory                   = local.services.identity.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "identity"
      image     = "${local.ecr_url}/${var.ecr_repository_prefix}/identity:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = local.services.identity.port
          protocol      = "tcp"
        }
      ]

      environment = concat(local.common_env, local.service_url_env, [
        { name = "PORT", value = tostring(local.services.identity.port) }
      ])

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:host::"
        },
        {
          name      = "SESSION_SECRET"
          valueFrom = "${aws_secretsmanager_secret.session.arn}:secret::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.services["identity"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${local.services.identity.port}/health/live || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# Catalog Service
resource "aws_ecs_task_definition" "catalog" {
  family                   = "${local.name_prefix}-catalog"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = local.services.catalog.cpu
  memory                   = local.services.catalog.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "catalog"
      image     = "${local.ecr_url}/${var.ecr_repository_prefix}/catalog:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = local.services.catalog.port
          protocol      = "tcp"
        }
      ]

      environment = concat(local.common_env, local.service_url_env, [
        { name = "PORT", value = tostring(local.services.catalog.port) }
      ])

      secrets = [
        {
          name      = "DATABASE_URL"
          valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:host::"
        }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.services["catalog"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${local.services.catalog.port}/health/live || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# Models Service (with EFS mount)
resource "aws_ecs_task_definition" "models" {
  family                   = "${local.name_prefix}-models"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = local.services.models.cpu
  memory                   = local.services.models.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  volume {
    name = "models-storage"

    efs_volume_configuration {
      file_system_id          = aws_efs_file_system.models.id
      transit_encryption      = "ENABLED"
      authorization_config {
        access_point_id = aws_efs_access_point.models.id
        iam             = "ENABLED"
      }
    }
  }

  container_definitions = jsonencode([
    {
      name      = "models"
      image     = "${local.ecr_url}/${var.ecr_repository_prefix}/models:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = local.services.models.port
          protocol      = "tcp"
        }
      ]

      mountPoints = [
        {
          sourceVolume  = "models-storage"
          containerPath = "/data/models"
          readOnly      = false
        }
      ]

      environment = concat(local.common_env, local.service_url_env, [
        { name = "PORT", value = tostring(local.services.models.port) },
        { name = "MODELS_PATH", value = "/data/models" },
        { name = "MAX_LOADED_MODELS", value = "2" },
        { name = "IDLE_TIMEOUT_MS", value = "300000" },
        { name = "DEFAULT_GPU_LAYERS", value = "0" },
        { name = "DEFAULT_THREADS", value = "4" }
      ])

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.services["models"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${local.services.models.port}/health/live || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 120  # Models may take longer to initialize
      }
    }
  ])
}

# Integrations Service
resource "aws_ecs_task_definition" "integrations" {
  family                   = "${local.name_prefix}-integrations"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = local.services.integrations.cpu
  memory                   = local.services.integrations.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = "integrations"
      image     = "${local.ecr_url}/${var.ecr_repository_prefix}/integrations:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = local.services.integrations.port
          protocol      = "tcp"
        }
      ]

      environment = concat(local.common_env, local.service_url_env, [
        { name = "PORT", value = tostring(local.services.integrations.port) }
      ])

      secrets = concat(
        [
          {
            name      = "DATABASE_URL"
            valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:host::"
          }
        ],
        var.openai_api_key != "" ? [
          {
            name      = "OPENAI_API_KEY"
            valueFrom = "${aws_secretsmanager_secret.llm_keys[0].arn}:openaiApiKey::"
          }
        ] : [],
        var.anthropic_api_key != "" ? [
          {
            name      = "ANTHROPIC_API_KEY"
            valueFrom = "${aws_secretsmanager_secret.llm_keys[0].arn}:anthropicApiKey::"
          }
        ] : []
      )

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.services["integrations"].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${local.services.integrations.port}/health/live || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# Generic task definition for simpler services
# (logging, messaging, runtime, assistants, network)
resource "aws_ecs_task_definition" "generic" {
  for_each = {
    for k, v in local.services : k => v
    if !contains(["identity", "catalog", "models", "integrations"], k)
  }

  family                   = "${local.name_prefix}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = each.value.cpu
  memory                   = each.value.memory
  execution_role_arn       = aws_iam_role.ecs_task_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  container_definitions = jsonencode([
    {
      name      = each.key
      image     = "${local.ecr_url}/${var.ecr_repository_prefix}/${each.key}:${var.image_tag}"
      essential = true

      portMappings = [
        {
          containerPort = each.value.port
          protocol      = "tcp"
        }
      ]

      environment = concat(local.common_env, local.service_url_env, [
        { name = "PORT", value = tostring(each.value.port) },
        # Network service needs hash secret
        each.key == "network" ? { name = "NETWORK_HASH_SECRET", value = "" } : null
      ])

      secrets = concat(
        [
          {
            name      = "DATABASE_URL"
            valueFrom = "${aws_secretsmanager_secret.db_credentials.arn}:host::"
          }
        ],
        each.key == "network" ? [
          {
            name      = "NETWORK_HASH_SECRET"
            valueFrom = "${aws_secretsmanager_secret.network.arn}:hashSecret::"
          }
        ] : []
      )

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.services[each.key].name
          awslogs-region        = var.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }

      healthCheck = {
        command     = ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:${each.value.port}/health/live || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 60
      }
    }
  ])
}

# =============================================================================
# ECS Services
# =============================================================================

# Identity Service
resource "aws_ecs_service" "identity" {
  name            = "identity"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.identity.arn
  desired_count   = local.services.identity.min_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["identity"].arn
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["identity"].arn
    container_name   = "identity"
    container_port   = local.services.identity.port
  }

  depends_on = [aws_lb_listener.https]
}

# Catalog Service
resource "aws_ecs_service" "catalog" {
  name            = "catalog"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.catalog.arn
  desired_count   = local.services.catalog.min_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["catalog"].arn
  }

  depends_on = [aws_ecs_service.identity]
}

# Models Service
resource "aws_ecs_service" "models" {
  name            = "models"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.models.arn
  desired_count   = local.services.models.min_count
  launch_type     = "FARGATE"

  platform_version = "1.4.0"  # Required for EFS

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["models"].arn
  }

  depends_on = [
    aws_ecs_service.identity,
    aws_ecs_service.catalog,
    aws_efs_mount_target.models
  ]
}

# Integrations Service
resource "aws_ecs_service" "integrations" {
  name            = "integrations"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.integrations.arn
  desired_count   = local.services.integrations.min_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services["integrations"].arn
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.services["integrations"].arn
    container_name   = "integrations"
    container_port   = local.services.integrations.port
  }

  depends_on = [
    aws_ecs_service.identity,
    aws_ecs_service.models,
    aws_lb_listener.https
  ]
}

# Generic services
resource "aws_ecs_service" "generic" {
  for_each = {
    for k, v in local.services : k => v
    if !contains(["identity", "catalog", "models", "integrations"], k)
  }

  name            = each.key
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.generic[each.key].arn
  desired_count   = each.value.min_count
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = module.vpc.private_subnets
    security_groups  = [aws_security_group.ecs_tasks.id]
    assign_public_ip = false
  }

  service_registries {
    registry_arn = aws_service_discovery_service.services[each.key].arn
  }

  dynamic "load_balancer" {
    for_each = contains(local.public_services, each.key) ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.services[each.key].arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }

  depends_on = [
    aws_ecs_service.identity,
    aws_ecs_service.catalog
  ]
}
