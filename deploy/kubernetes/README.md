# Deploying Symbia Stack to Kubernetes

This Helm chart deploys Symbia Stack to any Kubernetes cluster:
- **Managed**: EKS, GKE, AKS, DigitalOcean Kubernetes
- **Self-hosted**: k3s, k0s, kubeadm, Rancher

## Prerequisites

- Kubernetes cluster (1.25+)
- `kubectl` configured
- `helm` 3.x installed
- Container registry access (GHCR, ECR, etc.)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Kubernetes Cluster                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Ingress Controller                    │   │
│  │              (nginx-ingress / traefik)                   │   │
│  └─────────────────────────┬───────────────────────────────┘   │
│                            │                                     │
│  ┌─────────────────────────┴───────────────────────────────┐   │
│  │                      Services                            │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │ identity │ │ catalog  │ │ models   │ │assistants│   │   │
│  │  │ (deploy) │ │ (deploy) │ │ (deploy) │ │ (deploy) │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  │                                                          │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐   │   │
│  │  │messaging │ │ runtime  │ │integrat. │ │ network  │   │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                            │                                     │
│  ┌─────────────────────────┴───────────────────────────────┐   │
│  │   PostgreSQL (StatefulSet or External)                   │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │   PersistentVolumeClaim (models storage)                │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Quick Start

### 1. Add Helm Repository (if published)

```bash
helm repo add symbia https://symbia-labs.github.io/helm-charts
helm repo update
```

### 2. Or Install from Local Chart

```bash
cd deploy/kubernetes/helm

# Install with default values
helm install symbia ./symbia-stack \
  --namespace symbia \
  --create-namespace

# Or with custom values
helm install symbia ./symbia-stack \
  --namespace symbia \
  --create-namespace \
  -f my-values.yaml
```

### 3. Verify Installation

```bash
kubectl get pods -n symbia
kubectl get svc -n symbia
```

## Configuration

### values.yaml

```yaml
# Global settings
global:
  imageRegistry: ghcr.io/symbia-labs/symbia-stack
  imageTag: latest
  imagePullPolicy: IfNotPresent

# Database
postgresql:
  enabled: true  # Set false to use external database
  auth:
    database: symbia
    username: symbia
    password: ""  # Auto-generated if empty
  primary:
    persistence:
      size: 10Gi

# External database (if postgresql.enabled: false)
externalDatabase:
  host: ""
  port: 5432
  database: symbia
  username: symbia
  existingSecret: ""  # Secret containing password

# Ingress
ingress:
  enabled: true
  className: nginx
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: api.symbia.example.com
      paths:
        - path: /api/auth
          service: identity
        - path: /api/integrations
          service: integrations
        - path: /v1
          service: integrations
  tls:
    - secretName: symbia-tls
      hosts:
        - api.symbia.example.com

# Service configurations
services:
  identity:
    replicas: 2
    resources:
      requests:
        memory: 256Mi
        cpu: 100m
      limits:
        memory: 512Mi
        cpu: 500m

  models:
    replicas: 1
    resources:
      requests:
        memory: 2Gi
        cpu: 1000m
      limits:
        memory: 4Gi
        cpu: 2000m
    persistence:
      enabled: true
      size: 50Gi
      storageClass: ""  # Uses default

# Secrets
secrets:
  sessionSecret: ""      # Auto-generated if empty
  networkHashSecret: ""  # Auto-generated if empty

# Optional: LLM API keys
llmKeys:
  openaiApiKey: ""
  anthropicApiKey: ""
```

## Installation Examples

### Minimal (Development)

```bash
helm install symbia ./symbia-stack \
  --namespace symbia \
  --create-namespace \
  --set postgresql.enabled=true
```

### Production with External Database

```bash
helm install symbia ./symbia-stack \
  --namespace symbia \
  --create-namespace \
  --set postgresql.enabled=false \
  --set externalDatabase.host=mydb.example.com \
  --set externalDatabase.existingSecret=db-credentials \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=api.symbia.com
```

### With Custom Values File

```bash
# Create values file
cat > production-values.yaml << EOF
global:
  imageTag: v1.2.0

postgresql:
  enabled: false

externalDatabase:
  host: symbia-db.cluster-xxx.us-east-1.rds.amazonaws.com
  existingSecret: rds-credentials

ingress:
  enabled: true
  className: alb
  annotations:
    alb.ingress.kubernetes.io/scheme: internet-facing
    alb.ingress.kubernetes.io/target-type: ip
  hosts:
    - host: api.symbia.com

services:
  identity:
    replicas: 3
  models:
    replicas: 2
    resources:
      limits:
        memory: 8Gi
EOF

helm install symbia ./symbia-stack -f production-values.yaml -n symbia
```

## Platform-Specific Guides

### Amazon EKS

```bash
# Create cluster
eksctl create cluster --name symbia --region us-east-1

# Install AWS Load Balancer Controller
helm install aws-load-balancer-controller eks/aws-load-balancer-controller \
  -n kube-system \
  --set clusterName=symbia

# Install Symbia with ALB ingress
helm install symbia ./symbia-stack \
  --set ingress.className=alb \
  --set ingress.annotations."alb\.ingress\.kubernetes\.io/scheme"=internet-facing
```

### Google GKE

```bash
# Create cluster
gcloud container clusters create symbia --zone us-central1-a

# Install Symbia
helm install symbia ./symbia-stack \
  --set ingress.className=gce
```

### Azure AKS

```bash
# Create cluster
az aks create --resource-group symbia-rg --name symbia-aks

# Install Symbia
helm install symbia ./symbia-stack \
  --set ingress.className=azure-application-gateway
```

### k3s (Lightweight)

```bash
# Install k3s
curl -sfL https://get.k3s.io | sh -

# Install Symbia (traefik is default ingress)
helm install symbia ./symbia-stack \
  --set ingress.className=traefik
```

## Secrets Management

### Using External Secrets Operator

```yaml
# external-secret.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: symbia-secrets
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: ClusterSecretStore
  target:
    name: symbia-secrets
  data:
    - secretKey: session-secret
      remoteRef:
        key: symbia/production/session
    - secretKey: database-url
      remoteRef:
        key: symbia/production/database
```

### Using Sealed Secrets

```bash
# Encrypt secret
kubeseal --format yaml < secret.yaml > sealed-secret.yaml
kubectl apply -f sealed-secret.yaml
```

## Persistent Storage for Models

### Using PersistentVolumeClaim

```yaml
# In values.yaml
services:
  models:
    persistence:
      enabled: true
      size: 100Gi
      storageClass: gp3  # AWS EBS
```

### Pre-populating Models

```bash
# Create a job to download models
kubectl apply -f - << EOF
apiVersion: batch/v1
kind: Job
metadata:
  name: download-models
  namespace: symbia
spec:
  template:
    spec:
      containers:
      - name: download
        image: curlimages/curl
        command:
        - sh
        - -c
        - |
          curl -L -o /data/models/llama-3.2-1b.gguf \
            https://huggingface.co/.../resolve/main/model.gguf
        volumeMounts:
        - name: models
          mountPath: /data/models
      volumes:
      - name: models
        persistentVolumeClaim:
          claimName: symbia-models
      restartPolicy: Never
EOF
```

## Monitoring

### Prometheus + Grafana

```bash
# Install kube-prometheus-stack
helm install prometheus prometheus-community/kube-prometheus-stack

# ServiceMonitor for Symbia (if metrics endpoint exists)
kubectl apply -f - << EOF
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: symbia
  namespace: symbia
spec:
  selector:
    matchLabels:
      app.kubernetes.io/part-of: symbia
  endpoints:
  - port: http
    path: /metrics
EOF
```

## Scaling

### Horizontal Pod Autoscaler

```yaml
# In values.yaml
services:
  identity:
    autoscaling:
      enabled: true
      minReplicas: 2
      maxReplicas: 10
      targetCPUUtilizationPercentage: 70
```

### Manual Scaling

```bash
kubectl scale deployment symbia-identity --replicas=5 -n symbia
```

## Upgrades

```bash
# Upgrade to new version
helm upgrade symbia ./symbia-stack \
  --set global.imageTag=v1.3.0 \
  -n symbia

# Rollback if needed
helm rollback symbia 1 -n symbia
```

## Troubleshooting

### Check Pod Status
```bash
kubectl get pods -n symbia
kubectl describe pod symbia-identity-xxx -n symbia
kubectl logs symbia-identity-xxx -n symbia
```

### Check Services
```bash
kubectl get svc -n symbia
kubectl get ingress -n symbia
```

### Database Connection
```bash
# Port forward to test
kubectl port-forward svc/symbia-postgresql 5432:5432 -n symbia
psql -h localhost -U symbia -d symbia
```

### Exec into Pod
```bash
kubectl exec -it symbia-identity-xxx -n symbia -- sh
```

## Uninstall

```bash
# Uninstall release
helm uninstall symbia -n symbia

# Delete namespace (removes all resources)
kubectl delete namespace symbia

# Delete PVCs if needed
kubectl delete pvc -l app.kubernetes.io/instance=symbia -n symbia
```
