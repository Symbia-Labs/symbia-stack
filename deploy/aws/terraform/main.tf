# Symbia Stack - AWS Fargate Deployment
#
# This Terraform configuration deploys the complete Symbia stack to AWS
# using ECS Fargate, RDS PostgreSQL, and supporting services.

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Uncomment to use S3 backend for state
  # backend "s3" {
  #   bucket         = "symbia-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   dynamodb_table = "symbia-terraform-locks"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "symbia"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name_prefix = "symbia-${var.environment}"

  services = {
    identity = {
      port        = 5001
      cpu         = 256
      memory      = 512
      min_count   = 1
      max_count   = 2
      health_path = "/health/live"
    }
    logging = {
      port        = 5002
      cpu         = 256
      memory      = 512
      min_count   = 1
      max_count   = 2
      health_path = "/health/live"
    }
    catalog = {
      port        = 5003
      cpu         = 256
      memory      = 512
      min_count   = 1
      max_count   = 2
      health_path = "/health/live"
    }
    assistants = {
      port        = 5004
      cpu         = 512
      memory      = 1024
      min_count   = 1
      max_count   = 4
      health_path = "/health/live"
    }
    messaging = {
      port        = 5005
      cpu         = 256
      memory      = 512
      min_count   = 1
      max_count   = 2
      health_path = "/health/live"
    }
    runtime = {
      port        = 5006
      cpu         = 512
      memory      = 1024
      min_count   = 1
      max_count   = 4
      health_path = "/health/live"
    }
    integrations = {
      port        = 5007
      cpu         = 256
      memory      = 512
      min_count   = 1
      max_count   = 2
      health_path = "/health/live"
    }
    models = {
      port        = 5008
      cpu         = 1024
      memory      = 4096  # 4GB for LLM inference
      min_count   = 1
      max_count   = 2
      health_path = "/health/live"
      efs_mount   = true
    }
    network = {
      port        = 5054
      cpu         = 256
      memory      = 512
      min_count   = 1
      max_count   = 2
      health_path = "/health/live"
    }
  }

  # Services that should be exposed via ALB
  public_services = ["identity", "assistants", "messaging", "integrations"]
}

# =============================================================================
# VPC
# =============================================================================

module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = "${local.name_prefix}-vpc"
  cidr = var.vpc_cidr

  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = var.private_subnets
  public_subnets  = var.public_subnets

  enable_nat_gateway     = true
  single_nat_gateway     = var.environment != "production"
  enable_dns_hostnames   = true
  enable_dns_support     = true

  tags = {
    Name = "${local.name_prefix}-vpc"
  }
}

# =============================================================================
# Security Groups
# =============================================================================

# ALB Security Group
resource "aws_security_group" "alb" {
  name        = "${local.name_prefix}-alb-sg"
  description = "Security group for ALB"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-alb-sg"
  }
}

# ECS Tasks Security Group
resource "aws_security_group" "ecs_tasks" {
  name        = "${local.name_prefix}-ecs-tasks-sg"
  description = "Security group for ECS tasks"
  vpc_id      = module.vpc.vpc_id

  # Allow traffic from ALB
  ingress {
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # Allow inter-service communication
  ingress {
    from_port = 0
    to_port   = 65535
    protocol  = "tcp"
    self      = true
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "${local.name_prefix}-ecs-tasks-sg"
  }
}

# RDS Security Group
resource "aws_security_group" "rds" {
  name        = "${local.name_prefix}-rds-sg"
  description = "Security group for RDS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  tags = {
    Name = "${local.name_prefix}-rds-sg"
  }
}

# EFS Security Group
resource "aws_security_group" "efs" {
  name        = "${local.name_prefix}-efs-sg"
  description = "Security group for EFS"
  vpc_id      = module.vpc.vpc_id

  ingress {
    from_port       = 2049
    to_port         = 2049
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs_tasks.id]
  }

  tags = {
    Name = "${local.name_prefix}-efs-sg"
  }
}

# =============================================================================
# RDS PostgreSQL
# =============================================================================

resource "aws_db_subnet_group" "main" {
  name       = "${local.name_prefix}-db-subnet"
  subnet_ids = module.vpc.private_subnets

  tags = {
    Name = "${local.name_prefix}-db-subnet"
  }
}

resource "aws_db_instance" "main" {
  identifier = "${local.name_prefix}-postgres"

  engine               = "postgres"
  engine_version       = "15"
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  storage_encrypted    = true

  db_name  = "symbia"
  username = "symbia"
  password = random_password.db_password.result

  vpc_security_group_ids = [aws_security_group.rds.id]
  db_subnet_group_name   = aws_db_subnet_group.main.name

  backup_retention_period = var.environment == "production" ? 7 : 1
  skip_final_snapshot     = var.environment != "production"
  deletion_protection     = var.environment == "production"

  tags = {
    Name = "${local.name_prefix}-postgres"
  }
}

resource "random_password" "db_password" {
  length  = 32
  special = false
}

# =============================================================================
# Secrets Manager
# =============================================================================

resource "aws_secretsmanager_secret" "db_credentials" {
  name = "${local.name_prefix}/database"
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = aws_db_instance.main.username
    password = random_password.db_password.result
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
  })
}

resource "random_password" "session_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "session" {
  name = "${local.name_prefix}/session"
}

resource "aws_secretsmanager_secret_version" "session" {
  secret_id = aws_secretsmanager_secret.session.id
  secret_string = jsonencode({
    secret = random_password.session_secret.result
  })
}

resource "random_password" "network_hash_secret" {
  length  = 64
  special = false
}

resource "aws_secretsmanager_secret" "network" {
  name = "${local.name_prefix}/network"
}

resource "aws_secretsmanager_secret_version" "network" {
  secret_id = aws_secretsmanager_secret.network.id
  secret_string = jsonencode({
    hashSecret = random_password.network_hash_secret.result
  })
}

# Optional: LLM API keys (create manually or via variables)
resource "aws_secretsmanager_secret" "llm_keys" {
  count = var.openai_api_key != "" || var.anthropic_api_key != "" ? 1 : 0
  name  = "${local.name_prefix}/llm-keys"
}

resource "aws_secretsmanager_secret_version" "llm_keys" {
  count     = var.openai_api_key != "" || var.anthropic_api_key != "" ? 1 : 0
  secret_id = aws_secretsmanager_secret.llm_keys[0].id
  secret_string = jsonencode({
    openaiApiKey    = var.openai_api_key
    anthropicApiKey = var.anthropic_api_key
  })
}

# =============================================================================
# EFS (for models)
# =============================================================================

resource "aws_efs_file_system" "models" {
  creation_token = "${local.name_prefix}-models"
  encrypted      = true

  lifecycle_policy {
    transition_to_ia = "AFTER_30_DAYS"
  }

  tags = {
    Name = "${local.name_prefix}-models"
  }
}

resource "aws_efs_mount_target" "models" {
  count           = length(module.vpc.private_subnets)
  file_system_id  = aws_efs_file_system.models.id
  subnet_id       = module.vpc.private_subnets[count.index]
  security_groups = [aws_security_group.efs.id]
}

resource "aws_efs_access_point" "models" {
  file_system_id = aws_efs_file_system.models.id

  posix_user {
    gid = 1000
    uid = 1000
  }

  root_directory {
    path = "/models"
    creation_info {
      owner_gid   = 1000
      owner_uid   = 1000
      permissions = "755"
    }
  }

  tags = {
    Name = "${local.name_prefix}-models-ap"
  }
}

# =============================================================================
# ECS Cluster
# =============================================================================

resource "aws_ecs_cluster" "main" {
  name = "${local.name_prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }

  tags = {
    Name = "${local.name_prefix}-cluster"
  }
}

resource "aws_ecs_cluster_capacity_providers" "main" {
  cluster_name = aws_ecs_cluster.main.name

  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    base              = 1
    weight            = 100
    capacity_provider = var.environment == "production" ? "FARGATE" : "FARGATE_SPOT"
  }
}

# =============================================================================
# Service Discovery (Cloud Map)
# =============================================================================

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "symbia.local"
  description = "Service discovery for Symbia services"
  vpc         = module.vpc.vpc_id
}

resource "aws_service_discovery_service" "services" {
  for_each = local.services

  name = each.key

  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.main.id

    dns_records {
      ttl  = 10
      type = "A"
    }

    routing_policy = "MULTIVALUE"
  }

  health_check_custom_config {
    failure_threshold = 1
  }
}

# =============================================================================
# Application Load Balancer
# =============================================================================

resource "aws_lb" "main" {
  name               = "${local.name_prefix}-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = module.vpc.public_subnets

  enable_deletion_protection = var.environment == "production"

  tags = {
    Name = "${local.name_prefix}-alb"
  }
}

# HTTP listener (redirect to HTTPS)
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"

    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# HTTPS listener
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.main.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn

  default_action {
    type = "fixed-response"

    fixed_response {
      content_type = "application/json"
      message_body = jsonencode({ error = "Not found" })
      status_code  = "404"
    }
  }
}

# Target groups for public services
resource "aws_lb_target_group" "services" {
  for_each = toset(local.public_services)

  name        = "${local.name_prefix}-${each.key}"
  port        = local.services[each.key].port
  protocol    = "HTTP"
  vpc_id      = module.vpc.vpc_id
  target_type = "ip"

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200"
    path                = local.services[each.key].health_path
    port                = "traffic-port"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }

  tags = {
    Name = "${local.name_prefix}-${each.key}"
  }
}

# Listener rules for path-based routing
resource "aws_lb_listener_rule" "services" {
  for_each = toset(local.public_services)

  listener_arn = aws_lb_listener.https.arn
  priority     = index(local.public_services, each.key) + 1

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.services[each.key].arn
  }

  condition {
    path_pattern {
      values = each.key == "identity" ? ["/api/auth/*", "/api/users/*", "/api/orgs/*"] :
               each.key == "assistants" ? ["/api/assistants/*", "/api/conversations/*"] :
               each.key == "messaging" ? ["/api/messages/*", "/socket.io/*"] :
               each.key == "integrations" ? ["/api/integrations/*"] :
               ["/${each.key}/*"]
    }
  }
}

# =============================================================================
# IAM Roles
# =============================================================================

# ECS Task Execution Role
resource "aws_iam_role" "ecs_task_execution" {
  name = "${local.name_prefix}-ecs-task-execution"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "ecs_task_execution" {
  role       = aws_iam_role.ecs_task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "ecs_task_execution_secrets" {
  name = "secrets-access"
  role = aws_iam_role.ecs_task_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = [
          aws_secretsmanager_secret.db_credentials.arn,
          aws_secretsmanager_secret.session.arn,
          aws_secretsmanager_secret.network.arn
        ]
      }
    ]
  })
}

# ECS Task Role
resource "aws_iam_role" "ecs_task" {
  name = "${local.name_prefix}-ecs-task"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
      }
    ]
  })
}

# Allow ECS tasks to use EFS
resource "aws_iam_role_policy" "ecs_task_efs" {
  name = "efs-access"
  role = aws_iam_role.ecs_task.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "elasticfilesystem:ClientMount",
          "elasticfilesystem:ClientWrite"
        ]
        Resource = aws_efs_file_system.models.arn
      }
    ]
  })
}

# =============================================================================
# CloudWatch Log Groups
# =============================================================================

resource "aws_cloudwatch_log_group" "services" {
  for_each = local.services

  name              = "/ecs/${local.name_prefix}/${each.key}"
  retention_in_days = var.environment == "production" ? 30 : 7

  tags = {
    Name = "${local.name_prefix}-${each.key}-logs"
  }
}

# =============================================================================
# ECS Task Definitions and Services
# =============================================================================

# Task definitions are in separate file for clarity
# See: task-definitions.tf

# =============================================================================
# Outputs
# =============================================================================

output "alb_dns_name" {
  description = "DNS name of the load balancer"
  value       = aws_lb.main.dns_name
}

output "rds_endpoint" {
  description = "RDS endpoint"
  value       = aws_db_instance.main.endpoint
}

output "efs_id" {
  description = "EFS file system ID"
  value       = aws_efs_file_system.models.id
}

output "cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.main.name
}

output "service_discovery_namespace" {
  description = "Service discovery namespace"
  value       = aws_service_discovery_private_dns_namespace.main.name
}
