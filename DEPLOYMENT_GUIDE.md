# Wave Tracker Development - Deployment Guide

## 🚨 IMPORTANT: Always Deploy to the Correct Environment

### Current Setup:
- **🟠 Production**: `/home/jrdnkeith/projects/Wave-app` → `wave-tracker-exos` → Orange theme
- **🟣 Development**: `/home/jrdnkeith/projects/Wave-tracker-dev` → `wave-tracker-dev` → Purple theme

## Safe Deployment Commands

### For Development App (Purple Theme):
```bash
cd /home/jrdnkeith/projects/Wave-tracker-dev
npm run deploy
# OR
./scripts/deploy-dev.sh
```

### For Production App (Orange Theme):
```bash
cd /home/jrdnkeith/projects/Wave-app
npm run deploy
# OR
./scripts/deploy-prod.sh
```

## ⚠️ NEVER Use These Commands Directly:
- `firebase deploy --only hosting` (can deploy to wrong project)
- `npm run build && firebase deploy` (can deploy to wrong project)

## ✅ Always Use These Safe Commands:
- `npm run deploy` (uses the correct script for each project)
- `./scripts/deploy-dev.sh` (development only)
- `./scripts/deploy-prod.sh` (production only)

## Visual Confirmation:
- **🟠 Orange theme** = Production (safe for users)
- **🟣 Purple theme** = Development (for testing only)

## URLs:
- **Production**: https://wave-tracker-exos.web.app (Orange)
- **Development**: https://wave-tracker-dev.web.app (Purple)

## Current Status:
✅ Production app: Orange theme restored
✅ Development app: Purple theme active
✅ Safe deployment scripts created
✅ Clear visual distinction established
