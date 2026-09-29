import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';

// Keep in sync with the placeholder tokens in scripts/google-apps-script-webhook*.js.
const EVENT_ID_TOKEN = 'REPLACE_WITH_THIS_EVENTS_ID';
const SHEET_NAME_TOKEN = 'REPLACE_WITH_THIS_EVENTS_RESPONSE_SHEET_NAME';

// Each event type has its own Form questions, so each gets its own script template.
const TEMPLATE_FILE_BY_MOVEMENT_TIMING_MODE: Record<string, string> = {
  global: 'google-apps-script-webhook.js',
  individual: 'google-apps-script-webhook.js',
  lift: 'google-apps-script-webhook-lift-event.js',
};

function escapeForScriptString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const eventId = String(body?.eventId || '').trim();
    const responseSheetName = String(body?.responseSheetName || '').trim();
    const movementTimingMode = String(body?.movementTimingMode || '').trim();

    if (!eventId || !responseSheetName) {
      return NextResponse.json({ ok: false, error: 'eventId and responseSheetName are required' }, { status: 400 });
    }

    const templateFile = TEMPLATE_FILE_BY_MOVEMENT_TIMING_MODE[movementTimingMode];
    if (!templateFile) {
      return NextResponse.json({
        ok: false,
        error: 'This event type does not have a registration script template yet.',
      }, { status: 409 });
    }

    const templatePath = path.join(process.cwd(), 'scripts', templateFile);
    const template = await readFile(templatePath, 'utf8');

    const script = template
      .replaceAll(EVENT_ID_TOKEN, escapeForScriptString(eventId))
      .replaceAll(SHEET_NAME_TOKEN, escapeForScriptString(responseSheetName));

    return NextResponse.json({ ok: true, script });
  } catch (error) {
    console.error('Failed to build registration script:', error);
    return NextResponse.json({ ok: false, error: 'Failed to build registration script' }, { status: 500 });
  }
}
