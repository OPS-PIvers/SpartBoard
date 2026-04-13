#!/bin/bash
set -e

echo "Setting up environment..."

corepack enable
corepack prepare pnpm@10.30.2 --activate

pnpm run install:all

echo "Setup complete."
