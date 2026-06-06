// Google Apps Script webhook for test sheet integration
// Paste this file into Extensions > Apps Script in your Google Sheet.

// Production backend API URL (must end with /api/register).
const APP_BACKEND_URL = "https://wavetracker.web.app/api/register";

// Allowed response sheet tab names.
const RESPONSE_SHEET_NAMES = [
  "[TEST] Super Sprint Registration 2026 (Responses)",
  "Form Responses 1"
];

// Optional shared secret header for backend validation.
const WEBHOOK_SECRET = "";

// Secret expected by doPost reverse webhook calls from the app backend.
const REVERSE_WEBHOOK_SECRET = "WT_REVERSE_SYNC_2026_9f3k2m7q";

// Shared secret for Apps Script pull-sync requests to /api/register/cancellation-feed.
const PULL_SYNC_SECRET = "WT_REVERSE_SYNC_2026_9f3k2m7q";

// Event created/updated in Wave Tracker for this registration feed.
const APP_EVENT_ID = "super-sprint-registration-2026-test";

// Set true while testing to get detailed execution logs.
const DEBUG_LOGGING = true;

// Time-driven trigger cadence. Use 1 minute for testing, 5 for normal operation.
const TIME_DRIVEN_TRIGGER_MINUTES = 1;

const HEADER_MATCHERS = {
  timestamp: [/^timestamp$/],
  email: [/^email address$/, /^email$/],
  name: [/^name$/, /^full name$/],
  first_pref: [/time slot availability:\s*first preference/],
  first_flex: [/first preference flexibility/],
  second_pref: [/time slot availability:\s*second preference/],
  second_flex: [/second preference flexibility/],
  swim_comfort: [/swim comfort/],
  entry_mode: [/single.*buddy.*group/, /solo.*buddy.*group/, /^entry type$/, /^participation type$/],
  group_name: [/racing with a buddy or group/],
  first_tri: [/first triathlon/],
  ping_group: [/super sprint ping group/, /ping group/, /opt in below/],
  how_heard: [/how did you hear about this event/],
  first_gfit: [/first gfit event/],
  volunteer_opt_in: [/would you like to volunteer at the event/],
  comments: [/comments, questions, or accessibility needs/],
  reg_status: [/^registration status$/],
  confirmed_wave: [/^confirmed wave time$/],
  chat_link: [/^wave chat space link$/],
  calendar_sent: [/^calendar invite sent\?$/],
  volunteer_role: [/^volunteer role assigned$/],
  internal_notes: [/^internal notes$/]
  ,portal_url: [/^portal url$/, /^participant portal url$/, /portal url/]
  ,include_in_leaderboard: [/include in leaderboard/, /included on the leaderboard/, /show on leaderboard/, /leaderboard opt/]
};

function normalizeHeader(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/["']/g, '')
    .trim();
}

function buildColumnMap(sheet) {
  const headerValues = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const normalized = headerValues.map(normalizeHeader);
  const map = {};

  Object.keys(HEADER_MATCHERS).forEach((key) => {
    const matchers = HEADER_MATCHERS[key];
    const index = normalized.findIndex((header) => matchers.some((regex) => regex.test(header)));
    if (index >= 0) {
      map[key] = index + 1; // 1-based column index
    }
  });

  return map;
}

function getCell(values, colMap, key) {
  const col = colMap[key];
  if (!col) return null;
  return values[col - 1];
}

function isAllowedResponseSheet(name) {
  return RESPONSE_SHEET_NAMES.includes(name);
}

/**
 * Installable trigger: From spreadsheet > On form submit
 */
function onFormSubmitTrigger(e) {
  try {
    const sheet = e && e.range ? e.range.getSheet() : null;
    if (!sheet) {
      debugLog("onFormSubmitTrigger: no sheet in event payload");
      return;
    }
    if (!isAllowedResponseSheet(sheet.getName())) {
      debugLog("onFormSubmitTrigger: sheet mismatch", {
        got: sheet.getName(),
        expectedAnyOf: RESPONSE_SHEET_NAMES
      });
      return;
    }
    const colMap = buildColumnMap(sheet);

    const row = e.range.getRow();
    if (row <= 1) return;

    debugLog("onFormSubmitTrigger: firing", { row });

    // Ensure new rows default to Pending if Registration Status column exists.
    if (colMap.reg_status) {
      const statusCell = sheet.getRange(row, colMap.reg_status);
      if (!statusCell.getValue()) {
        statusCell.setValue("Pending");
      }
    }

    sendPayload(sheet, row, colMap, "form_submit");
  } catch (err) {
    Logger.log("onFormSubmitTrigger error: " + err);
  }
}

/**
 * Installable trigger: From spreadsheet > On edit
 */
function onEditTrigger(e) {
  try {
    const range = e && e.range ? e.range : null;
    if (!range) {
      debugLog("onEditTrigger: missing range in event payload");
      return;
    }

    const sheet = range.getSheet();
    if (!isAllowedResponseSheet(sheet.getName())) {
      debugLog("onEditTrigger: sheet mismatch", {
        got: sheet.getName(),
        expectedAnyOf: RESPONSE_SHEET_NAMES
      });
      return;
    }
    const colMap = buildColumnMap(sheet);

    const startRow = range.getRow();
    const endRow = startRow + range.getNumRows() - 1;
    const startCol = range.getColumn();
    const endCol = startCol + range.getNumColumns() - 1;
    if (endRow <= 1) return;

    // Fire webhook only for internal management columns that exist on this sheet.
    const watchedCols = [
      colMap.reg_status,
      colMap.confirmed_wave,
      colMap.chat_link,
      colMap.volunteer_role,
      colMap.internal_notes
    ].filter(Boolean);

    const touchedWatchedCols = watchedCols.filter(function (c) {
      return c >= startCol && c <= endCol;
    });

    if (touchedWatchedCols.length === 0) {
      debugLog("onEditTrigger: edit ignored (non-watched columns)", {
        startRow: startRow,
        endRow: endRow,
        startCol: startCol,
        endCol: endCol,
        watchedCols: watchedCols,
        mappedColumns: colMap
      });
      return;
    }

    const targetStartRow = Math.max(2, startRow);
    const rowsToProcess = [];
    for (let row = targetStartRow; row <= endRow; row += 1) {
      rowsToProcess.push(row);
    }

    debugLog("onEditTrigger: firing", {
      rows: rowsToProcess.length,
      startRow: targetStartRow,
      endRow: endRow,
      touchedWatchedCols: touchedWatchedCols
    });

    rowsToProcess.forEach(function (row) {
      sendPayload(sheet, row, colMap, "manual_edit");
    });
  } catch (err) {
    Logger.log("onEditTrigger error: " + err);
  }
}

/**
 * Installs or repairs all expected installable triggers.
 * Run this once from Apps Script editor after deployment/config changes.
 */
function installOrRepairTriggers() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('No active spreadsheet available for trigger setup.');
  }

  const expected = {
    onFormSubmitTrigger: { type: 'forSpreadsheet' },
    onEditTrigger: { type: 'forSpreadsheet' },
    syncNewRegistrationsFromSheet: { type: 'timeDriven' },
    syncCancelledRegistrationsFromApp: { type: 'timeDriven' }
  };

  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function (trigger) {
    const handler = trigger.getHandlerFunction();
    if (expected[handler]) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('onFormSubmitTrigger')
    .forSpreadsheet(spreadsheet)
    .onFormSubmit()
    .create();

  ScriptApp.newTrigger('onEditTrigger')
    .forSpreadsheet(spreadsheet)
    .onEdit()
    .create();

  ScriptApp.newTrigger('syncNewRegistrationsFromSheet')
    .timeBased()
    .everyMinutes(TIME_DRIVEN_TRIGGER_MINUTES)
    .create();

  ScriptApp.newTrigger('syncCancelledRegistrationsFromApp')
    .timeBased()
    .everyMinutes(TIME_DRIVEN_TRIGGER_MINUTES)
    .create();

  logInstalledTriggers();
}

/**
 * Logs all installed project triggers for quick verification.
 */
function logInstalledTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  const summary = triggers.map(function (trigger) {
    return {
      handler: trigger.getHandlerFunction(),
      eventType: String(trigger.getEventType())
    };
  });
  debugLog('Installed triggers', summary);
}

/**
 * Resets the new-registration sync cursor so the next run can re-scan rows.
 * Pass a row number (>=1). Default is 1.
 */
function resetNewRegistrationSyncCursor(toRow) {
  const sheet = getResponseSheet();
  if (!sheet) {
    throw new Error('No response sheet found.');
  }

  const props = PropertiesService.getScriptProperties();
  const key = 'LAST_SYNCED_ROW_' + sheet.getSheetId();
  const next = Math.max(1, Number(toRow) || 1);
  props.setProperty(key, String(next));

  debugLog('resetNewRegistrationSyncCursor: updated', {
    key: key,
    row: next
  });
}

/**
 * Quick diagnostics for new-row sync status and header mapping.
 */
function diagnoseRegistrationSync() {
  const sheet = getResponseSheet();
  if (!sheet) {
    debugLog('diagnoseRegistrationSync: no response sheet found');
    return;
  }

  const colMap = buildColumnMap(sheet);
  const props = PropertiesService.getScriptProperties();
  const key = 'LAST_SYNCED_ROW_' + sheet.getSheetId();
  const lastSynced = Number(props.getProperty(key) || 1);

  debugLog('diagnoseRegistrationSync', {
    sheet: sheet.getName(),
    lastRow: sheet.getLastRow(),
    lastSyncedRow: lastSynced,
    syncCursorKey: key,
    mappedColumns: colMap
  });
}

/**
 * Manual utility for stress tests: push an entire row range to the backend.
 * Run from Apps Script editor after bulk pasting test rows.
 */
function backfillPastedRows(startRow, endRow) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("No active spreadsheet");

  const sheet = ss.getSheets().find(function (s) {
    return isAllowedResponseSheet(s.getName());
  });

  if (!sheet) {
    throw new Error("No allowed response sheet found. Check RESPONSE_SHEET_NAMES.");
  }

  const colMap = buildColumnMap(sheet);
  const first = Math.max(2, Number(startRow) || 2);
  const last = Math.max(first, Number(endRow) || sheet.getLastRow());

  debugLog("backfillPastedRows: start", {
    sheet: sheet.getName(),
    startRow: first,
    endRow: last
  });

  for (let row = first; row <= last; row += 1) {
    const nameValue = safeString(sheet.getRange(row, colMap.name || 1).getValue());
    if (!nameValue) continue;
    sendPayload(sheet, row, colMap, "bulk_backfill");
  }

  debugLog("backfillPastedRows: complete", {
    startRow: first,
    endRow: last
  });
}

/**
 * Time-driven auto sync for newly added sheet rows.
 * Recommended trigger cadence: every 5 minutes.
 */
function syncNewRegistrationsFromSheet() {
  const sheet = getResponseSheet();
  if (!sheet) {
    debugLog('syncNewRegistrationsFromSheet: no response sheet found');
    return;
  }

  const colMap = buildColumnMap(sheet);
  const props = PropertiesService.getScriptProperties();
  const key = 'LAST_SYNCED_ROW_' + sheet.getSheetId();
  const lastSynced = Number(props.getProperty(key) || 1);
  const sheetLastRow = sheet.getLastRow();

  if (sheetLastRow <= 1 || sheetLastRow <= lastSynced) {
    debugLog('syncNewRegistrationsFromSheet: no new rows', {
      lastSynced: lastSynced,
      sheetLastRow: sheetLastRow
    });
    return;
  }

  const start = Math.max(2, lastSynced + 1);
  let processed = 0;

  for (let row = start; row <= sheetLastRow; row += 1) {
    const nameValue = safeString(sheet.getRange(row, colMap.name || 1).getValue());
    if (!nameValue) continue;
    sendPayload(sheet, row, colMap, 'time_driven_sync');
    processed += 1;
  }

  props.setProperty(key, String(sheetLastRow));

  debugLog('syncNewRegistrationsFromSheet: complete', {
    startRow: start,
    endRow: sheetLastRow,
    processed: processed
  });
}

function sendPayload(sheet, row, colMap, triggerSource) {
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nameValue = safeString(getCell(values, colMap, 'name'));

  const parsedEntry = splitEntryModeAndGroupName(
    getCell(values, colMap, 'entry_mode'),
    getCell(values, colMap, 'group_name')
  );
  const optIns = parseCommunityOptIns(
    getCell(values, colMap, 'ping_group'),
    colMap.include_in_leaderboard ? getCell(values, colMap, 'include_in_leaderboard') : null
  );

  const payload = {
    event_id: APP_EVENT_ID,
    source_sheet: sheet.getName(),
    trigger_source: triggerSource,
    row_number: row,
    timestamp: toIsoDate(getCell(values, colMap, 'timestamp')),
    name: nameValue,
    first_preference_hour: safeString(getCell(values, colMap, 'first_pref')),
    first_preference_flexibility: safeString(getCell(values, colMap, 'first_flex')),
    second_preference_hour: safeString(getCell(values, colMap, 'second_pref')),
    second_preference_flexibility: safeString(getCell(values, colMap, 'second_flex')),
    swim_comfort: safeString(getCell(values, colMap, 'swim_comfort')),
    entry_mode: parsedEntry.entry_mode,
    group_name: parsedEntry.group_name,
    is_first_tri: toBoolean(getCell(values, colMap, 'first_tri')),
    ping_group_opt_in: optIns.pingGroupOptIn,
    how_heard: safeString(getCell(values, colMap, 'how_heard')),
    is_first_gfit: toBoolean(getCell(values, colMap, 'first_gfit')),
    volunteer_opt_in: toBoolean(getCell(values, colMap, 'volunteer_opt_in')),
    comments: safeString(getCell(values, colMap, 'comments')),
    // Preserve existing app status/wave during replay when management columns are absent.
    registration_status: colMap.reg_status
      ? (safeString(getCell(values, colMap, 'reg_status')) || 'Pending')
      : '',
    confirmed_wave_time: colMap.confirmed_wave
      ? formatTime(getCell(values, colMap, 'confirmed_wave'))
      : null,
    chat_link: safeString(getCell(values, colMap, 'chat_link')),
    calendar_invite_sent: toBoolean(getCell(values, colMap, 'calendar_sent')),
    include_in_leaderboard: optIns.includeInLeaderboard,
    volunteer_role: safeString(getCell(values, colMap, 'volunteer_role')),
    internal_notes: safeString(getCell(values, colMap, 'internal_notes'))
  };


  debugLog("sendPayload: posting webhook", {
    row,
    triggerSource,
    registration_status: payload.registration_status,
    confirmed_wave_time: payload.confirmed_wave_time
  });

  const headers = { Accept: "application/json" };
  if (WEBHOOK_SECRET) {
    headers["X-Webhook-Secret"] = WEBHOOK_SECRET;
  }

  const options = {
    method: "post",
    contentType: "application/json",
    headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(APP_BACKEND_URL, options);
  const responseCode = response.getResponseCode();
  let responseData = null;

  if (responseCode === 200) {
    try {
      responseData = JSON.parse(response.getContentText());
    } catch (err) {
      Logger.log("Webhook response parse warning: " + err);
    }
  }

  // Auto-write backend allocation result into the sheet for fully hands-free registrations.
  if (
    triggerSource === "form_submit" &&
    responseCode === 200 &&
    responseData &&
    responseData.status === "success" &&
    responseData.mode === "auto_allocation"
  ) {
    if (colMap.reg_status && responseData.registration_status) {
      sheet.getRange(row, colMap.reg_status).setValue(responseData.registration_status);
    }

    if (colMap.confirmed_wave) {
      if (responseData.assigned_wave) {
        sheet.getRange(row, colMap.confirmed_wave).setValue(responseData.assigned_wave);
      } else {
        sheet.getRange(row, colMap.confirmed_wave).clearContent();
      }
    }

    if (colMap.portal_url) {
      if (responseData.portal_url) {
        sheet.getRange(row, colMap.portal_url).setValue(responseData.portal_url);
      } else {
        sheet.getRange(row, colMap.portal_url).clearContent();
      }
    }

    debugLog("sendPayload: auto-writeback applied", {
      row,
      registration_status: responseData.registration_status || null,
      assigned_wave: responseData.assigned_wave || null,
      portal_url: responseData.portal_url || null
    });
  }

  Logger.log(
    "Webhook POST row " +
      row +
      " => " +
      responseCode +
      " | " +
      response.getContentText()
  );
}

function debugLog(message, data) {
  if (!DEBUG_LOGGING) return;
  if (data === undefined) {
    Logger.log(message);
    return;
  }
  try {
    Logger.log(message + " | " + JSON.stringify(data));
  } catch (err) {
    Logger.log(message + " | (unserializable data)");
  }
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const v = safeString(value).toLowerCase();
  return v === "yes" || v === "true" || v === "y" || v === "1";
}

function parseCommunityOptIns(rawPingGroupValue, rawLeaderboardValue) {
  const pingRaw = safeString(rawPingGroupValue);
  const options = tokenizeMultiSelect(rawPingGroupValue);
  const hasChatOption = options.some(function (option) {
    return /chat|ping group|group chat|updates|photos|coach/.test(option);
  });
  const hasLeaderboardOption = options.some(function (option) {
    return /leaderboard|results|rankings?/.test(option);
  });

  // Explicit separate leaderboard field wins when present.
  const explicitLeaderboard = rawLeaderboardValue !== null && rawLeaderboardValue !== undefined
    ? toBoolean(rawLeaderboardValue)
    : null;

  if (!pingRaw && explicitLeaderboard === null) {
    return {
      pingGroupOptIn: false,
      includeInLeaderboard: false
    };
  }

  // If question is a multi-select and no tokens matched, treat it as opted out.
  const hasMultiSelectSignal = options.length > 0;

  const pingGroupOptIn = hasChatOption || (!hasMultiSelectSignal && toBoolean(rawPingGroupValue));
  const includeInLeaderboard = explicitLeaderboard !== null
    ? explicitLeaderboard
    : (hasLeaderboardOption || (!hasMultiSelectSignal ? true : false));

  return {
    pingGroupOptIn: pingGroupOptIn,
    includeInLeaderboard: includeInLeaderboard
  };
}

function tokenizeMultiSelect(value) {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) {
    return value
      .map(function (item) { return safeString(item).toLowerCase(); })
      .filter(Boolean);
  }

  const text = safeString(value);
  if (!text) return [];

  return text
    .split(/\s*,\s*|\s*;\s*|\n+/)
    .map(function (item) { return safeString(item).toLowerCase(); })
    .filter(Boolean);
}

function safeString(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

function toIsoDate(value) {
  if (value instanceof Date) return value.toISOString();
  const v = safeString(value);
  return v || null;
}

function splitEntryModeAndGroupName(rawEntryMode, rawGroupField) {
  const explicitMode = safeString(rawEntryMode);
  const groupField = safeString(rawGroupField);

  if (explicitMode) {
    return {
      entry_mode: explicitMode,
      group_name: groupField
    };
  }

  if (!groupField) {
    return {
      entry_mode: '',
      group_name: ''
    };
  }

  // Supports checkbox+Other style values like "Group, Friend Name".
  const parts = groupField.split(',').map(function (p) { return safeString(p); }).filter(Boolean);
  if (parts.length === 0) {
    return {
      entry_mode: '',
      group_name: ''
    };
  }

  const first = parts[0].toLowerCase();
  if (first === 'single' || first === 'solo' || first === 'buddy' || first === 'group') {
    return {
      entry_mode: parts[0],
      group_name: parts.slice(1).join(', ')
    };
  }

  return {
    entry_mode: '',
    group_name: groupField
  };
}

function formatTime(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "h:mm a");
  }
  return safeString(value) || null;
}

/**
 * Deploy this script as a Web App to support reverse cancellation sync from backend.
 * Expects JSON body: { action, row_number, secret }
 */
function doPost(e) {
  try {
    const raw = e && e.postData ? e.postData.contents : '{}';
    const body = JSON.parse(raw || '{}');

    if (REVERSE_WEBHOOK_SECRET && body.secret !== REVERSE_WEBHOOK_SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (body.action !== 'cancel_registration') {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'unsupported_action' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = null;
    for (var s = 0; s < RESPONSE_SHEET_NAMES.length; s++) {
      sheet = spreadsheet.getSheetByName(RESPONSE_SHEET_NAMES[s]);
      if (sheet) break;
    }

    if (!sheet) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'response_sheet_not_found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    const colMap = buildColumnMap(sheet);
    let row = Number(body.row_number || 0);

    if (!row || row <= 1) {
      return ContentService
        .createTextOutput(JSON.stringify({ ok: false, error: 'row_not_found' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    if (colMap.reg_status) {
      sheet.getRange(row, colMap.reg_status).setValue('Cancelled');
    }
    if (colMap.confirmed_wave) {
      sheet.getRange(row, colMap.confirmed_wave).clearContent();
    }

     debugLog('doPost: cancellation write-back applied', { row });

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true, row }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function getBackendBaseUrl() {
  return APP_BACKEND_URL.replace(/\/api\/register\/?$/, '');
}

function getResponseSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  for (var s = 0; s < RESPONSE_SHEET_NAMES.length; s++) {
    const candidate = spreadsheet.getSheetByName(RESPONSE_SHEET_NAMES[s]);
    if (candidate) return candidate;
  }
  return null;
}

/**
 * Fallback for org-restricted Apps Script deployments:
 * Pull pending cancellations from backend and apply to sheet.
 * Recommended trigger: time-driven every 1-5 minutes.
 */
function syncCancelledRegistrationsFromApp() {
  const sheet = getResponseSheet();
  if (!sheet) {
    debugLog('syncCancelledRegistrationsFromApp: no response sheet found');
    return;
  }

  const colMap = buildColumnMap(sheet);
  const feedUrl =
    getBackendBaseUrl() +
    '/api/register/cancellation-feed?event_id=' +
    encodeURIComponent(APP_EVENT_ID) +
    '&secret=' +
    encodeURIComponent(PULL_SYNC_SECRET);

  const res = UrlFetchApp.fetch(feedUrl, {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Accept: 'application/json' }
  });

  if (res.getResponseCode() !== 200) {
    Logger.log('syncCancelledRegistrationsFromApp feed error: ' + res.getResponseCode() + ' | ' + res.getContentText());
    return;
  }

  let payload;
  try {
    payload = JSON.parse(res.getContentText());
  } catch (err) {
    Logger.log('syncCancelledRegistrationsFromApp parse error: ' + err);
    return;
  }

  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    debugLog('syncCancelledRegistrationsFromApp: no pending cancellations');
    return;
  }

  const ackIds = [];
  for (var i = 0; i < items.length; i++) {
    const item = items[i];
    var row = Number(item.row_number || 0);

    if (!row || row <= 1) {
      debugLog('syncCancelledRegistrationsFromApp: row not found', { id: item.id || null, row_number: item.row_number || null });
      continue;
    }

    if (colMap.reg_status) {
      sheet.getRange(row, colMap.reg_status).setValue('Cancelled');
    }
    if (colMap.confirmed_wave) {
      sheet.getRange(row, colMap.confirmed_wave).clearContent();
    }

    ackIds.push(item.id);
  }

  if (ackIds.length === 0) {
    return;
  }

  const ackRes = UrlFetchApp.fetch(getBackendBaseUrl() + '/api/register/cancellation-feed', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({
      event_id: APP_EVENT_ID,
      secret: PULL_SYNC_SECRET,
      ack_ids: ackIds
    }),
    muteHttpExceptions: true,
    headers: { Accept: 'application/json' }
  });

  debugLog('syncCancelledRegistrationsFromApp: processed', {
    updatedRows: ackIds.length,
    ackStatus: ackRes.getResponseCode()
  });
}
