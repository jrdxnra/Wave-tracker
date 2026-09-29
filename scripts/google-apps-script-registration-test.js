// Bind this script to the GFIT Games registration response Sheet (Extensions > Apps Script).
// Run testConnection() first, then installFormSubmitTrigger() to receive new responses.
// The response tab must be Form Responses 1 with this form's lift-question headers.
// Dev and production share Firestore: real form submissions will appear in the GFIT Games event.

const APP_BACKEND_URL = 'https://wavetracker--dev-j6zqu05u.web.app/api/register';
const APP_EVENT_ID = 'gfit-games';
const RESPONSE_SHEET_NAME = 'Form Responses 1';

const FIELDS = {
  timestamp: /^timestamp$/,
  name: /^(full )?name$/,
  division: /select division category/,
  squat_first_preference: /back squat time slot availability:\s*first preference/,
  squat_second_preference: /back squat time slot availability:\s*second preference/,
  squat_opener_weight: /first attempt weight for squat/,
  squat_rack_height: /rack height for back squat/,
  bench_first_preference: /bench press time slot availability:\s*first preference/,
  bench_second_preference: /bench press time slot availability:\s*second preference/,
  bench_opener_weight: /first attempt weight for bench/,
  bench_rack_height: /rack height for bench press/,
  deadlift_first_preference: /deadlift time slot availability:\s*first preference/,
  deadlift_second_preference: /deadlift time slot availability:\s*second preference/,
  deadlift_opener_weight: /^(?!.*squat)(?!.*bench).*first attempt weight/,
  olympic_lifting_selection: /olympic lifting time slot availability/,
  is_first_gfit_games: /first gfit games/,
  how_heard: /how did you hear about this event/,
  is_first_hp_event: /first h\+p event/,
  volunteer_opt_in: /would you like to volunteer at the event/,
  comments: /comments, questions, or accessibility needs/
};

function responseSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(RESPONSE_SHEET_NAME);
  if (!sheet) throw new Error('Response tab not found: ' + RESPONSE_SHEET_NAME);
  columnMap(sheet);
  return sheet;
}

function columnMap(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
    .map(function (header) { return String(header || '').toLowerCase().replace(/\s+/g, ' ').trim(); });
  const columns = {};
  Object.keys(FIELDS).forEach(function (field) {
    const index = headers.findIndex(function (header) { return FIELDS[field].test(header); });
    if (index >= 0) columns[field] = index;
  });
  ['name', 'squat_first_preference', 'bench_first_preference', 'deadlift_first_preference'].forEach(function (field) {
    if (columns[field] === undefined) throw new Error('Required registration column not found: ' + field);
  });
  return columns;
}

function postRow(sheet, row) {
  const columns = columnMap(sheet);
  const values = sheet.getRange(row, 1, 1, sheet.getLastColumn()).getValues()[0];
  const fieldValue = function (field) {
    const value = columns[field] === undefined ? '' : values[columns[field]];
    return value instanceof Date ? value.toISOString() : String(value == null ? '' : value).trim();
  };
  const name = fieldValue('name');
  if (!name) throw new Error('No name at row ' + row);

  const payload = {
    event_id: APP_EVENT_ID,
    registration_template: 'lift-event',
    source_sheet: sheet.getName(),
    trigger_source: 'form_submit',
    row_number: row,
    name: name,
    timestamp: fieldValue('timestamp'),
    olympic_lifts_opt_in: fieldValue('olympic_lifting_selection') !== '' &&
      !/^not entering this event$/i.test(fieldValue('olympic_lifting_selection'))
  };
  Object.keys(FIELDS).forEach(function (field) {
    if (field === 'name' || field === 'timestamp') return;
    if (field === 'is_first_gfit_games' || field === 'is_first_hp_event' || field === 'volunteer_opt_in') {
      payload[field] = /^yes$/i.test(fieldValue(field));
    } else {
      payload[field] = fieldValue(field);
    }
  });

  const response = UrlFetchApp.fetch(APP_BACKEND_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  Logger.log('Registration row ' + row + ' => ' + code + ' | ' + response.getContentText());
  if (code < 200 || code >= 300) throw new Error('Registration webhook returned HTTP ' + code);
}

function onRegistrationSubmit(event) {
  const sheet = responseSheet();
  if (!event || !event.range || event.range.getSheet().getSheetId() !== sheet.getSheetId()) return;
  postRow(sheet, event.range.getRow());
}

function testConnection() {
  const sheet = responseSheet();
  Logger.log('Using registration response tab: ' + sheet.getName());
  const response = UrlFetchApp.fetch(APP_BACKEND_URL, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ event_id: APP_EVENT_ID }),
    muteHttpExceptions: true
  });
  const body = JSON.parse(response.getContentText());
  if (response.getResponseCode() !== 400 || body.error !== 'row_number or portal_url row token is required') {
    throw new Error('Connection failed: HTTP ' + response.getResponseCode() + ' | ' + response.getContentText());
  }
  Logger.log('Connection OK: dev registration endpoint responded; no registration was created.');
}

function installFormSubmitTrigger() {
  responseSheet();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'onRegistrationSubmit') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('onRegistrationSubmit')
    .forSpreadsheet(SpreadsheetApp.getActiveSpreadsheet()).onFormSubmit().create();
  Logger.log('Form-submit trigger installed. Send a new test Form response to test the data sync.');
}