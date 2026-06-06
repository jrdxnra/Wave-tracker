# Wave Tracker Integration Blueprint & Code Templates

This blueprint provides the exact layouts, formula logic, and copy-paste-ready code to set up both registration tracks in parallel. It ensures that if you finish testing Track B (the automated app) in Codespaces, you can flip the switch instantly. If not, Track A (the manual sheet) is completely ready to run the event on its own.

---

## Part 1: Unified Google Sheet Column Layout
When the Google Form is linked to a Google Sheet, it automatically creates columns A through O. To make this sheet a powerful "Control Center" for Jillian and Jordan, manually add the **Internal Event Management** and **Capacity Tracker** columns starting in **Column P**.

### 1. Form-Populated Columns (Columns A - O)
*Do not touch or rearrange these columns; they sync directly with Google Form submissions.*
*   **Column A:** `Timestamp`
*   **Column B:** `Email Address` (Unique Identifier)
*   **Column C:** `Name`
*   **Column D:** `Time Slot Availability: First Preference`
*   **Column E:** `First Preference Flexibility`
*   **Column F:** `Time Slot Availability: Second Preference`
*   **Column G:** `Second Preference Flexibility`
*   **Column H:** `Swim Comfort & Lane Placement`
*   **Column I:** `Are you racing with a buddy or group?`
*   **Column J:** `Is this your first triathlon?`
*   **Column K:** `Want to join the Super Sprint ping group?`
*   **Column L:** `How did you hear about this event?`
*   **Column M:** `Is this your first GFit event?`
*   **Column N:** `Would you like to volunteer at the event?`
*   **Column O:** `Any comments, questions, or accessibility needs?`

### 2. Manual Organizer Columns (Columns P - U)
*Coordinators use these to manage status, assign waves, and track logistics manually.*
*   **Column P: `Registration Status`**  
    *   *Values:* Dropdown containing: `Pending`, `Confirmed`, `Waitlisted`, `Cancelled`.
*   **Column Q: `Confirmed Wave Time`**  
    *   *Values:* Dropdown containing all 17 actual 15-minute start times (e.g., `8:00 AM`, `8:15 AM`, `8:30 AM` up to `12:00 PM`).
*   **Column R: `Wave Chat Space Link`**  
    *   *Values:* Text link. Managed by Elliot to invite participants to their wave's Google Chat.
*   **Column S: `Calendar Invite Sent?`**  
    *   *Values:* Checkbox (`TRUE` / `FALSE`). Toggled by Elliot and Jack once the Calendar Invite is deployed.
*   **Column T: `Volunteer Role Assigned`**  
    *   *Values:* Text/Dropdown (e.g., `Pool Deck`, `Transition 1 Guide`, `Transition 2 Guide`, `Recovery Station`). Managed by Anthony.
*   **Column U: `Internal Notes`**  
    *   *Values:* Text. For manual tracking overrides (e.g., *"Rescheduled 3/28 to match teammate"*).

### 3. Dynamic Capacity Monitor (Columns W - Y)
*Set this up on the far right of the sheet as a sidebar dashboard to prevent waves from exceeding the 17-person capacity limit.*
*   **Column W: `Wave Start Time`** (Manually pre-populate rows 2 to 18 with: `8:00 AM`, `8:15 AM`, `8:30 AM`, ..., `12:00 PM`).
*   **Column X: `Active Registrations`**  
    *   *Formula for Cell X2 (drag down to X18):*  
        `=COUNTIFS($Q$2:$Q$1000, W2, $P$2:$P$1000, "Confirmed")`
    *   *Why this works:* It only counts participants whose status is explicitly set to "Confirmed" in Column P, ensuring cancelled or waitlisted registrants don't take up slots.
*   **Column Y: `Remaining Slots`**  
    *   *Formula for Cell Y2 (drag down to Y18):*  
        `=17 - X2`
*   **Conditional Formatting Rule:**  
    Apply a rule to column `X2:X18`: *If cell value is >= 17*, highlight in **Light Red**. This gives the manual team an instant visual warning if a wave is full.

---

## Part 2: Google Apps Script Webhook Code
This script runs in the Google Sheet. It sends data to your web app backend in GitHub Codespaces immediately under two conditions:
1.  **On Form Submit:** Sends a "Pending" record to the app database.
2.  **On Manual Edit:** If Jordan/Jillian change a user's status to `Confirmed` or edit their `Confirmed Wave Time`, it instantly updates the app backend.

### To Install:
1.  In your Google Sheet, click **Extensions** > **Apps Script**.
2.  Open the script source file at `scripts/google-apps-script-webhook.js`, then copy/paste it into Apps Script.
3.  Replace `APP_BACKEND_URL` with your temporary Codespaces forwarding URL (or local tunneling URL).
4.  Click the disk icon to save.
5.  Set up an **installable trigger**: Click the clock icon (Triggers) on the left sidebar > **Add Trigger** > Choose `onFormSubmitTrigger` > Select Event Source: `From spreadsheet` > Select Event Type: `On form submit` > Save. Do the same for `onEditTrigger` with event type `On edit`.

```javascript
// Replace with your GitHub Codespaces forwarded API URL (must end with /api/register)
const APP_BACKEND_URL = "https://probable-capybara-pvw69xv45wjh7vqg-3000.app.github.dev/api/register";

// Keep this aligned with your actual response sheet tab name.
const RESPONSE_SHEET_NAME = "[TEST] Super Sprint Registration 2026 (Responses)";

// Optional shared secret header for backend validation.
const WEBHOOK_SECRET = "";

const COL = {
  TIMESTAMP: 1,          // A
  EMAIL: 2,              // B
  NAME: 3,               // C
  FIRST_PREF: 4,         // D
  FIRST_FLEX: 5,         // E
  SECOND_PREF: 6,        // F
  SECOND_FLEX: 7,        // G
  SWIM_COMFORT: 8,       // H
  GROUP_NAME: 9,         // I
  FIRST_TRI: 10,         // J
  PING_GROUP: 11,        // K
  HOW_HEARD: 12,         // L
  FIRST_GFIT: 13,        // M
  VOLUNTEER_OPT_IN: 14,  // N
  COMMENTS: 15,          // O
  REG_STATUS: 16,        // P
  CONFIRMED_WAVE: 17,    // Q
  CHAT_LINK: 18,         // R
  CALENDAR_SENT: 19,     // S
  VOLUNTEER_ROLE: 20,    // T
  INTERNAL_NOTES: 21     // U
};

/**
 * Installable trigger: From spreadsheet > On form submit
 */
function onFormSubmitTrigger(e) {
  try {
    const sheet = e && e.range ? e.range.getSheet() : null;
    if (!sheet || sheet.getName() !== RESPONSE_SHEET_NAME) return;

    const row = e.range.getRow();
    if (row <= 1) return;

    // Ensure new rows default to Pending in column P.
    const statusCell = sheet.getRange(row, COL.REG_STATUS);
    if (!statusCell.getValue()) {
      statusCell.setValue("Pending");
    }

    sendPayload(sheet, row, "form_submit");
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
    if (!range) return;

    const sheet = range.getSheet();
    if (sheet.getName() !== RESPONSE_SHEET_NAME) return;

    const row = range.getRow();
    const col = range.getColumn();
    if (row <= 1) return;

    // Fire webhook only for internal management columns.
    const watchedCols = [
      COL.REG_STATUS,
      COL.CONFIRMED_WAVE,
      COL.CHAT_LINK,
      COL.VOLUNTEER_ROLE,
      COL.INTERNAL_NOTES
    ];
    if (!watchedCols.includes(col)) return;

    sendPayload(sheet, row, "manual_edit");
  } catch (err) {
    Logger.log("onEditTrigger error: " + err);
  }
}

function sendPayload(sheet, row, triggerSource) {
  const values = sheet.getRange(row, 1, 1, COL.INTERNAL_NOTES).getValues()[0];

  const payload = {
    trigger_source: triggerSource,
    row_number: row,
    timestamp: toIsoDate(values[COL.TIMESTAMP - 1]),
    email: safeString(values[COL.EMAIL - 1]).toLowerCase(),
    name: safeString(values[COL.NAME - 1]),
    first_preference_hour: safeString(values[COL.FIRST_PREF - 1]),
    first_preference_flexibility: safeString(values[COL.FIRST_FLEX - 1]),
    second_preference_hour: safeString(values[COL.SECOND_PREF - 1]),
    second_preference_flexibility: safeString(values[COL.SECOND_FLEX - 1]),
    swim_comfort: safeString(values[COL.SWIM_COMFORT - 1]),
    group_name: safeString(values[COL.GROUP_NAME - 1]),
    is_first_tri: toBoolean(values[COL.FIRST_TRI - 1]),
    ping_group_opt_in: toBoolean(values[COL.PING_GROUP - 1]),
    how_heard: safeString(values[COL.HOW_HEARD - 1]),
    is_first_gfit: toBoolean(values[COL.FIRST_GFIT - 1]),
    volunteer_opt_in: toBoolean(values[COL.VOLUNTEER_OPT_IN - 1]),
    comments: safeString(values[COL.COMMENTS - 1]),
    registration_status: safeString(values[COL.REG_STATUS - 1]) || "Pending",
    confirmed_wave_time: formatTime(values[COL.CONFIRMED_WAVE - 1]),
    chat_link: safeString(values[COL.CHAT_LINK - 1]),
    calendar_invite_sent: toBoolean(values[COL.CALENDAR_SENT - 1]),
    volunteer_role: safeString(values[COL.VOLUNTEER_ROLE - 1]),
    internal_notes: safeString(values[COL.INTERNAL_NOTES - 1])
  };

  if (!payload.email) {
    Logger.log("Skipping webhook: missing email at row " + row);
    return;
  }

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
  Logger.log(
    "Webhook POST row " +
      row +
      " => " +
      response.getResponseCode() +
      " | " +
      response.getContentText()
  );
}

function toBoolean(value) {
  if (typeof value === "boolean") return value;
  const v = safeString(value).toLowerCase();
  return v === "yes" || v === "true" || v === "y" || v === "1";
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
```

---

## Part 3: Python Database Schema (GitHub Codespaces Web App)
Paste this SQLAlchemy model code directly into your app's database configuration file (e.g., `models.py`). This sets up a relational schema that models waves, participants, and check-in statuses precisely.

```python
from datetime import datetime, time
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

class Wave(db.Model):
    """
    Pre-seeded wave table. Repesents the 17 distinct start slots on August 7, 2026.
    Allows for quick capacity checks.
    """
    __tablename__ = 'waves'
    
    id = db.Column(db.Integer, primary_key=True)
    start_time = db.Column(db.Time, unique=True, nullable=False) # e.g. time(9, 15)
    capacity_limit = db.Column(db.Integer, default=17) # Targeted limit
    chat_link = db.Column(db.String(512), nullable=True) # Managed by Elliot
    
    participants = db.relationship('Participant', backref='wave', lazy=True)

    @property
    def current_count(self):
        # Calculate current active confirmed count
        return sum(1 for p in self.participants if p.registration_status == 'Confirmed')


class Participant(db.Model):
    """
    Participant registration and event day tracking data.
    Maps directly to Google Form entries and manual sheet modifications.
    """
    __tablename__ = 'participants'
    
    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(255), unique=True, nullable=False) # Primary key from Form
    name = db.Column(db.String(255), nullable=False)
    
    # Scheduling Preferences
    first_preference_hour = db.Column(db.String(100), nullable=True)
    first_preference_flex = db.Column(db.String(100), nullable=True)
    second_preference_hour = db.Column(db.String(100), nullable=True)
    second_preference_flex = db.Column(db.String(100), nullable=True)
    
    # Social & Grouping
    group_name = db.Column(db.String(255), nullable=True) # Used to group friends together
    ping_group_opt_in = db.Column(db.Boolean, default=False)
    
    # Athlete Profile & Safety
    is_first_tri = db.Column(db.Boolean, default=False) # Triggers custom portal guides
    is_first_gfit = db.Column(db.Boolean, default=False)
    swim_comfort = db.Column(db.String(50), nullable=False, default="Intermediate")
    
    # Organizer Tracking Details
    registration_status = db.Column(db.String(50), default="Pending") # Pending, Confirmed, Waitlisted, Cancelled
    wave_id = db.Column(db.Integer, db.ForeignKey('waves.id'), nullable=True) # Assigned 15-min Wave
    volunteer_opt_in = db.Column(db.Boolean, default=False)
    volunteer_role = db.Column(db.String(255), nullable=True)
    comments = db.Column(db.Text, nullable=True)
    
    # Event Day Tracking (August 7, 2026)
    checked_in = db.Column(db.Boolean, default=False) # Toggled by pool deck coach
    checked_in_time = db.Column(db.DateTime, nullable=True)
    
    # Performance Times (5m Swim, 13m Bike, 10m Run)
    swim_laps = db.Column(db.Integer, default=0, nullable=True)
    bike_distance_miles = db.Column(db.Float, default=0.0, nullable=True)
    run_laps = db.Column(db.Integer, default=0, nullable=True)
    
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        """Converts database object to dictionary for API JSON responses."""
        return {
            "id": self.id,
            "email": self.email,
            "name": self.name,
            "registration_status": self.registration_status,
            "wave_time": self.wave.start_time.strftime("%I:%M %p") if self.wave else None,
            "chat_link": self.wave.chat_link if self.wave else "",
            "is_first_tri": self.is_first_tri,
            "swim_comfort": self.swim_comfort,
            "group_name": self.group_name,
            "checked_in": self.checked_in,
            "results": {
                "swim_laps": self.swim_laps,
                "bike_distance": self.bike_distance_miles,
                "run_laps": self.run_laps
            }
        }
```
