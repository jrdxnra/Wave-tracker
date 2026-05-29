#!/bin/bash

set -euo pipefail

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
CURRENT_PROJECT=$(firebase use)
echo "Current Firebase project: $CURRENT_PROJECT"

if [ "$CURRENT_PROJECT" != "wave-tracker-exos" ]; then
    echo "⚠️  Switching to wave-tracker-exos project..."
    firebase use wave-tracker-exos
fi

# Build the project
echo "🔨 Building app..."
npm run build

# Deploy to production hosting
echo "🚀 Deploying to hosting..."
firebase deploy --only hosting --project wave-tracker-exos

echo ""
echo "✅ Hosting deployment complete!"
echo "Visit: https://wavetracker.web.app"
