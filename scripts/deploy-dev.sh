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
	echo "Unsupported Node.js version for deploy: $(node -v)"
	echo "Use Node 22 before running this deploy script."
	echo ""
	exit 1
fi

echo "Deploying Wave Tracker to DEV preview channel..."
echo "Project: wave-tracker-exos"
echo "Channel: dev"
echo ""

echo "Cleaning local build artifacts..."
rm -rf .next .firebase/wavetracker

echo "Building app..."
npm run build

echo "Deploying to Firebase Hosting preview channel..."
"$FIREBASE_BIN" hosting:channel:deploy dev --project wave-tracker-exos --expires 14d

echo ""
echo "Dev deploy complete."
echo "This does NOT update production live hosting."
