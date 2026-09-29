// Google Apps Script webhook — Lift Event template. ONE script bound to ONE Google Form + ONE Google Sheet per event.
// Paste this file into Extensions > Apps Script in that Sheet.
//
// Reusing this for a new Lift Event (do this every time, do NOT create a second Form for the same event):
//   1. Create exactly one Google Form for the event and link it to exactly one new Google Sheet.
//   2. Update the 4 constants directly below to match that Form/Sheet.
//   3. Re-run installOrRepairTriggers() from the Apps Script editor.
// If a second Form/Sheet gets created by accident, delete it — do not add its tab name below.

// Production backend API URL (must end with /api/register).
const APP_BACKEND_URL = "https://wavetracker.web.app/api/register";

// The exact response sheet tab name for THIS event's Form (Sheet > tab at the bottom).
// Keep this to a single exact name. Do not add a second/duplicate form's tab name here.
const RESPONSE_SHEET_NAMES = [
  "REPLACE_WITH_THIS_EVENTS_RESPONSE_SHEET_NAME"
];

// Optional shared secret header for backend validation.
const WEBHOOK_SECRET = "";

// Secret expected by doPost reverse webhook calls from the app backend.
const REVERSE_WEBHOOK_SECRET = "WT_REVERSE_SYNC_2026_9f3k2m7q";

// Shared secret for Apps Script pull-sync requests to /api/register/cancellation-feed.
const PULL_SYNC_SECRET = "WT_REVERSE_SYNC_2026_9f3k2m7q";

// The Wave Tracker event ID this Form/Sheet feeds (must match the event created in the app).
const APP_EVENT_ID = "REPLACE_WITH_THIS_EVENTS_ID";

// Set true temporarily only when troubleshooting in production.
const DEBUG_LOGGING = false;

// Time-driven trigger cadence. 5 minutes is the production default.
const TIME_DRIVEN_TRIGGER_MINUTES = 5;

// Header matchers written against the SVL GFit Games 2026 Flight Sign Up form wording.
// Squat/bench openers both contain "please enter it here", so the deadlift opener matcher
// excludes headers that mention squat/bench to stay unambiguous.
const HEADER_MATCHERS = {
  timestamp: [/^timestamp$/],
  email: [/^email$/, /^email address$/],
  name: [/^name$/, /^full name$/],
  division: [/select division category/],
  squat_first_pref: [/back squat time slot availability:\s*first preference/],
  squat_second_pref: [/back squat time slot availability:\s*second preference/],
  squat_opener_weight: [/first attempt weight for squat/],
  squat_rack_height: [/rack height for back squat/],
  bench_first_pref: [/bench press time slot availability:\s*first preference/],
  bench_second_pref: [/bench press time slot availability:\s*second preference/],
  bench_opener_weight: [/first attempt weight for bench/],
  bench_rack_height: [/rack height for bench press/],
  deadlift_first_pref: [/deadlift time slot availability:\s*first preference/],
  deadlift_second_pref: [/deadlift time slot availability:\s*second preference/],
  deadlift_opener_weight: [/^(?!.*squat)(?!.*bench).*first attempt weight/],
  olympic_selection: [/olympic lifting time slot availability/],
  how_heard: [/how did you hear about this event/],
  is_first_gfit_games: [/first gfit games/],
  is_first_hp_event: [/first h\+p event/],
  volunteer_opt_in: [/would you like to volunteer at the event/],
  comments: [/comments, questions, or accessibility needs/],
  reg_status: [/^registration status$/],
  confirmed_wave: [/^confirmed wave time$/],
  chat_link: [/^wave chat space link$/],
  calendar_sent: [/^calendar invite sent\?$/],
  volunteer_role: [/^volunteer role assigned$/],
  internal_notes: [/^internal notes$/],
  portal_url: [/^portal url$/, /^participant portal url$/, /portal url/]
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
  // Exact match only — a loose fallback here would let a second, accidentally-created
  // Form's tab (e.g. "Form Responses 2") get treated as valid.
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
    sendPayload(sheet, row, colMap, 'form_submit');
    processed += 1;
  }

  props.setProperty(key, String(sheetLastRow));

  debugLog('syncNewRegistrationsFromSheet: complete', {
    startRow: start,
    endRow: sheetLastRow,
    processed: processed
  });
}

// True unless the lifter's Olympic answer is empty or only "Not entering this event".
function deriveOlympicOptIn(rawValue) {
  const options = tokenizeMultiSelect(rawValue);
  return options.some(function (option) { return !/not entering/.test(option); });
}

function sendPayload(sheet, row, colMap, triggerSource) {
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const nameValue = safeString(getCell(values, colMap, 'name'));
  const olympicSelectionRaw = safeString(getCell(values, colMap, 'olympic_selection'));

  const payload = {
    event_id: APP_EVENT_ID,
    registration_template: 'lift-event',
    source_sheet: sheet.getName(),
    trigger_source: triggerSource,
    row_number: row,
    timestamp: toIsoDate(getCell(values, colMap, 'timestamp')),
    name: nameValue,
    division: safeString(getCell(values, colMap, 'division')),
    squat_first_preference: safeString(getCell(values, colMap, 'squat_first_pref')),
    squat_second_preference: safeString(getCell(values, colMap, 'squat_second_pref')),
    squat_opener_weight: safeString(getCell(values, colMap, 'squat_opener_weight')),
    squat_rack_height: safeString(getCell(values, colMap, 'squat_rack_height')),
    bench_first_preference: safeString(getCell(values, colMap, 'bench_first_pref')),
    bench_second_preference: safeString(getCell(values, colMap, 'bench_second_pref')),
    bench_opener_weight: safeString(getCell(values, colMap, 'bench_opener_weight')),
    bench_rack_height: safeString(getCell(values, colMap, 'bench_rack_height')),
    deadlift_first_preference: safeString(getCell(values, colMap, 'deadlift_first_pref')),
    deadlift_second_preference: safeString(getCell(values, colMap, 'deadlift_second_pref')),
    deadlift_opener_weight: safeString(getCell(values, colMap, 'deadlift_opener_weight')),
    olympic_lifting_selection: olympicSelectionRaw,
    olympic_lifts_opt_in: deriveOlympicOptIn(olympicSelectionRaw),
    how_heard: safeString(getCell(values, colMap, 'how_heard')),
    is_first_gfit_games: toBoolean(getCell(values, colMap, 'is_first_gfit_games')),
    is_first_hp_event: toBoolean(getCell(values, colMap, 'is_first_hp_event')),
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
    volunteer_role: safeString(getCell(values, colMap, 'volunteer_role')),
    internal_notes: safeString(getCell(values, colMap, 'internal_notes')),
    portal_url: safeString(getCell(values, colMap, 'portal_url'))
  };

  debugLog("sendPayload: posting webhook", {
    row,
    triggerSource,
    registration_status: payload.registration_status
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

    const sheet = getResponseSheet();
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

  if (ackIds.length === 0) return;

  const ackUrl = getBackendBaseUrl() + '/api/register/cancellation-feed';
  const ackRes = UrlFetchApp.fetch(ackUrl, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    payload: JSON.stringify({ event_id: APP_EVENT_ID, secret: PULL_SYNC_SECRET, ack_ids: ackIds })
  });

  debugLog('syncCancelledRegistrationsFromApp: acked', {
    count: ackIds.length,
    responseCode: ackRes.getResponseCode()
  });
}
