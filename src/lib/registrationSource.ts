export function isWebhookRegistrationRow(row: {
  id: string;
  source?: string;
  sourceSheet?: string;
  triggerSource?: string;
  sourceWaitlistId?: string;
}): boolean {
  const source = String(row.source || '').trim().toLowerCase();
  const trigger = String(row.triggerSource || '').trim().toLowerCase();
  const hasSourceSheet = String(row.sourceSheet || '').trim().length > 0;
  const hasRowId = /^row-\d+$/i.test(String(row.id || '').trim());

  return hasSourceSheet || Boolean(row.sourceWaitlistId) || source === 'google-form-webhook' ||
    trigger === 'form_submit' || trigger === 'time_driven_sync' ||
    trigger === 'bulk_backfill' || hasRowId;
}