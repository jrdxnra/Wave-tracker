# Alert Settings - Hardcoded Configuration

## What Was Removed
The Alert Settings UI section has been **permanently removed** from the Configuration Modal. This section previously allowed users to choose between:
- Sound types: Beep, Air Horn, Whistle
- Visual effects: Flash, Expand, Both

## What Is Now Hardcoded
Alert settings are now **hardcoded** and cannot be changed by users:

```typescript
alertSettings: {
  workRestTransitions: true,    // Always enabled
  eventStartEnd: true,           // Always enabled
  soundType: 'beep',             // Always beep sound
  visualEffect: 'flash'          // Always flash animation
}
```

## Why This Was Done
- Simplified user interface
- Reduced configuration complexity
- Beep sound is the standard/preferred alert
- Flash visual effect provides good feedback without being distracting

## Files Modified
1. **src/components/ConfigurationModal.tsx**
   - Removed Alert Settings UI section (lines 252-363)
   - Removed preview sound functions
   - Removed preview effect functions
   - Removed alert state management

2. **src/store/waveStore.ts**
   - Removed `setAlertSettings()` function
   - Hardcoded alertSettings in initial state
   - Simplified alertSettings type to only allow 'beep' and 'flash'

3. **src/components/EventClock.tsx**
   - Updated type definitions to match hardcoded values
   - Component still uses alertSettings but values are now fixed

## What Still Works
✅ Audio alerts (beep sound) on work/rest transitions
✅ Visual flash effects on transitions
✅ Event start/end alerts
✅ All timing and countdown functionality

## If Settings "Come Back"
If you see the Alert Settings UI reappear in the Configuration Modal, it means:
1. Files were restored from an old backup
2. Code was pulled from an old commit
3. Someone manually re-added the code

**Solution**: Refer to this document and re-apply the changes listed above.

## Date Removed
January 2025 (Context: User reported these settings had been removed before but came back)
