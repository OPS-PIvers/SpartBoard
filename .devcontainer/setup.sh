#!/bin/bash

# 1. Enable Corepack and prepare pnpm
echo "Setting up pnpm..."
corepack enable
corepack prepare pnpm@latest --activate

# 2. Install project dependencies
echo "Installing project dependencies..."
pnpm install

# 3. Install Playwright browsers (for testing)
echo "Installing Playwright..."
npx playwright install --with-deps

# 4. Install Global CLI Tools
echo "Installing global tools (Gemini, Firebase, Jules)..."
pnpm add -g @google/gemini-cli firebase-tools @google/jules

# 5. Install Gemini Extensions
# We use a loop so if one fails, the others still install.
EXTENSIONS=(
  "https://github.com/gemini-cli-extensions/stitch"
  "https://github.com/ChromeDevTools/chrome-devtools-mcp"
  "https://github.com/gemini-cli-extensions/code-review"
  "https://github.com/upstash/context7"
  "https://github.com/gemini-cli-extensions/firebase"
  "https://github.com/gemini-cli-extensions/jules"
  "https://github.com/gemini-cli-extensions/security"
)

echo "Installing Gemini extensions..."
for ext in "${EXTENSIONS[@]}"; do
  echo "Installing $ext..."
  gemini extensions install "$ext" --consent || echo "⚠️  Failed to install $ext, skipping..."
done

echo "✅ Setup complete!"
