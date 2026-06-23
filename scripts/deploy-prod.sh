#!/bin/bash

set -euo pipefail

FIREBASE_BIN="./node_modules/.bin/firebase"
if [ ! -x "$FIREBASE_BIN" ]; then
    echo ""
    echo "Firebase CLI not found at $FIREBASE_BIN"
    echo "Run: npm install --save-dev firebase-tools"
    echo ""
    exit 1
fi

NODE_MAJOR=$(node -v | sed -E 's/^v([0-9]+).*/\1/')
if [ "$NODE_MAJOR" -ne 22 ]; then
    echo ""
    echo "❌ Unsupported Node.js version for deploy: $(node -v)"
    echo "Firebase frameworks deploy is validated on Node 22 for this project."
    echo "Switch to Node 22, then retry deploy."
    echo ""
    exit 1
fi

# Hosting deployment script for Wave Tracker production live site

if [ "${ALLOW_PROD_DEPLOY:-}" != "YES" ]; then
    echo ""
    echo "Production deploy is blocked by default."
    echo "To deploy to production, run:"
    echo "ALLOW_PROD_DEPLOY=YES npm run deploy:prod"
    echo ""
    exit 1
fi

echo "🚀 Deploying Wave Tracker hosting..."
echo "📍 Project: Wave Tracker (wave-tracker-exos)"
echo "🌐 URL: https://wavetracker.web.app"
echo ""

# Check current Firebase project
CURRENT_PROJECT=$($FIREBASE_BIN use)
echo "Current Firebase project: $CURRENT_PROJECT"

if [ "$CURRENT_PROJECT" != "wave-tracker-exos" ]; then
    echo "⚠️  Switching to wave-tracker-exos project..."
    "$FIREBASE_BIN" use wave-tracker-exos
fi

# Build the project
echo "🧹 Cleaning local build artifacts..."
rm -rf .next .firebase/wavetracker

echo "🔨 Building app..."
npm run build

# Deploy to production hosting
echo "🚀 Deploying to hosting..."
"$FIREBASE_BIN" deploy --only hosting --project wave-tracker-exos

echo ""
echo "✅ Hosting deployment complete!"
echo "Visit: https://wavetracker.web.app"
