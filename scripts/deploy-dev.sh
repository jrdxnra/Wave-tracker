#!/bin/bash

set -euo pipefail

echo "Deploying Wave Tracker to DEV preview channel..."
echo "Project: wave-tracker-exos"
echo "Channel: dev"
echo ""

echo "Building app..."
npm run build

echo "Deploying to Firebase Hosting preview channel..."
firebase hosting:channel:deploy dev --project wave-tracker-exos --expires 14d

echo ""
echo "Dev deploy complete."
echo "This does NOT update production live hosting."
