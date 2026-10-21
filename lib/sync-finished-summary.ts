/** Turns a finished sync into the status sentence shown after Sync with TMS. */
export function syncFinishedSummary(input: {
  createdCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  connectedCount?: number;
  disconnectedCount?: number;
  details?: Array<{ outcome: string; transactionId?: string }>;
}): string {
  const parts = [
    `${input.createdCount} added`,
    `${input.updatedCount} updated`,
    `${input.connectedCount ?? 0} connected to TMS`,
    `${input.disconnectedCount ?? 0} disconnected from TMS`,
  ];
  const skips = (input.details || []).filter((detail) => detail.outcome === 'skip');
  const existing = skips.filter((detail) => detail.transactionId).length;
  const notAdded = skips.filter((detail) => !detail.transactionId).length;
  const unclassified = Math.max(0, input.skippedCount - existing - notAdded);
  const sheetRows = notAdded + (existing === 0 ? unclassified : 0);
  if (sheetRows > 0) {
    parts.push(`${sheetRows} sheet row${sheetRows === 1 ? ' is' : 's are'} outside the default view and ${sheetRows === 1 ? 'was' : 'were'} not added`);
  }
  parts.push(`${input.errorCount} error${input.errorCount === 1 ? '' : 's'}`);
  return `${parts.join(', ')}.`;
}

/** The transactions-page note for the latest finished sync. */
function syncTimestamp(finishedAt: string): string {
  const finished = new Date(finishedAt);
  if (Number.isNaN(finished.getTime())) return finishedAt;
  const date = finished.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const time = finished.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${date} at ${time}`;
}

/** The last-sync line once that sync was undone, so its counts are not read as current. */
export function undoneSyncNote(finishedAt: string): string {
  return `Last sync with TMS on ${syncTimestamp(finishedAt)} was undone.`;
}

export function lastSyncResultsNote(input: {
  finishedAt: string;
  createdCount: number;
  updatedCount: number;
  connectedCount: number;
  disconnectedCount: number;
  errorCount: number;
}): string {
  const timestamp = syncTimestamp(input.finishedAt);
  const errorLabel = `${input.errorCount} error${input.errorCount === 1 ? '' : 's'}`;
  const results = [
    `${input.createdCount} added`,
    `${input.updatedCount} updated`,
    errorLabel,
    `${input.connectedCount} connected to TMS`,
    `${input.disconnectedCount} disconnected from TMS`,
  ].join(', ');
  return `Last sync with TMS finished on ${timestamp}. Results: ${results}.`;
}

/** User-facing copy for a TMS ID that shows up more than once in the sheet. */
export function duplicateTmsIdReason(count = 1): string {
  return count === 1
    ? 'This TMS ID is a duplicate in your TMS.'
    : 'These TMS IDs are duplicates in your TMS.';
}

export function isDuplicateTmsIdReason(reason: string): boolean {
  const text = reason.trim();
  if (/^TMS ID .+ already appeared in this sheet\.$/.test(text)) return true;
  if (/^This TMS ID is a duplicate in your TMS\.$/.test(text)) return true;
  if (/^These TMS IDs are duplicates in your TMS\.$/.test(text)) return true;
  return /can no longer be found in (?:your|the) TMS \(rogue\)/.test(text);
}
