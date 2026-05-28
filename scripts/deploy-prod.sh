#!/bin/bash

# Production Deployment Script for Wave Tracker
# This script ensures we only deploy to the production project

echo "🚀 Deploying to PRODUCTION environment..."
echo "📍 Project: Wave Tracker (wave-tracker-exos)"
echo "🎨 Theme: Orange"
echo "🌐 URL: https://wave-tracker-exos.web.app"
echo ""

# Check current Firebase project
CURRENT_PROJECT=$(firebase use --quiet)
echo "Current Firebase project: $CURRENT_PROJECT"

if [ "$CURRENT_PROJECT" != "wave-tracker-exos" ]; then
    echo "⚠️  Switching to production project..."
    firebase use wave-tracker-exos
fi

# Build the project
echo "🔨 Building production app..."
npm run build

# Deploy to production hosting
echo "🚀 Deploying to production hosting..."
firebase deploy --only hosting

echo ""
echo "✅ Production deployment complete!"
echo "🟠 Visit your orange production app: https://wave-tracker-exos.web.app"
echo "🟣 Development app (purple): https://wave-tracker-dev.web.app"
