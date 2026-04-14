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
npx playwright install --with-deps

# 4. Install Global CLI Tools via NPM
# (NPM is used here to ensure they land in /usr/local/bin for all users)
echo "🛠️  Installing global tools (Gemini, Firebase, Jules)..."
sudo npm install -g @google/gemini-cli firebase-tools @google/jules

# 5. Install Gemini Extensions
echo "🧩 Installing Gemini extensions..."
EXTENSIONS=(
  "https://github.com/gemini-cli-extensions/stitch"
  "https://github.com/ChromeDevTools/chrome-devtools-mcp"
  "https://github.com/gemini-cli-extensions/code-review"
  "https://github.com/upstash/context7"
  "https://github.com/gemini-cli-extensions/firebase"
  "https://github.com/gemini-cli-extensions/jules"
  "https://github.com/gemini-cli-extensions/security"
)

for ext in "${EXTENSIONS[@]}"; do
  echo "Installing $ext..."
  gemini extensions install "$ext" --consent || echo "⚠️  Failed to install $ext, skipping..."
done

echo "✅ Environment setup complete!"
