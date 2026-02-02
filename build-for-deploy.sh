#!/bin/bash
set -e

echo "Building Symbia Platform for deployment..."

echo "Step 1: Building libraries..."
npm run build -w symbia-sys
npm run build -w symbia-relay -w symbia-logging-client
npm run build -w symbia-auth -w symbia-db -w symbia-http -w symbia-seed -w symbia-md -w symbia-id -w symbia-messaging-client

echo "Step 2: Building services..."
npm run build -w identity -w logging -w catalog -w messaging -w network -w runtime -w assistants -w integrations -w models

echo "Step 3: Building website..."
cd website && npm run build

echo "Build complete!"
