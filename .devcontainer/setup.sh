#!/bin/bash
set -e # Exit immediately if a command fails

echo "🚀 Starting SPART Board Environment Setup..."

# 1. Setup PNPM for the project
echo "📦 Enabling corepack and pnpm..."
corepack enable
corepack prepare pnpm@10.30.2 --activate

# 2. Install Project Dependencies
echo "📥 Installing project dependencies..."
pnpm run install:all

# 3. Install Playwright Browsers
echo "🎭 Installing Playwright browsers..."
pnpm exec playwright install --with-deps chromium

echo "✅ Environment setup complete!"
