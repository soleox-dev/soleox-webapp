import type { SupabaseClient } from '@supabase/supabase-js';

export interface AuditEvent {
  clientId: string;
  actorEmail: string;
  action: string;
  entity: 'permission' | 'template' | 'transaction' | 'sync' | 'client' | 'agent';
  entityId?: string | null;
  summary: string;
  detail?: Record<string, unknown>;
}

function missingTable(message: string): boolean {
  return message.includes('does not exist') || message.includes('schema cache');
}

function auditRow(event: AuditEvent): Record<string, unknown> {
  const detail = event.detail ?? {};
  let stored: Record<string, unknown> = detail;
  try {
    if (JSON.stringify(detail).length > 8000) stored = { note: 'Detail omitted because it was too large.' };
  } catch {
    stored = {};
  }
  return {
    client_id: event.clientId,
    actor_email: event.actorEmail.trim().toLowerCase(),
    action: event.action,
    entity: event.entity,
    entity_id: event.entityId || null,
    summary: event.summary.slice(0, 500),
    detail: stored,
  };
}

/** Append one audit row. A failed write is logged and does not undo the change that already succeeded. */
export async function recordAudit(supabase: SupabaseClient, event: AuditEvent): Promise<void> {
  await recordAudits(supabase, [event]);
}

/** Append several audit rows in one insert. Failures are handled like recordAudit. */
export async function recordAudits(supabase: SupabaseClient, events: AuditEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { error } = await supabase.from('audit_events').insert(events.map(auditRow));
  if (!error) return;
  const message = error.message || 'The audit event could not be saved.';
  if (missingTable(message)) {
    console.warn('Audit events are not available until migration 046 is applied.');
    return;
  }
  console.error('Audit event failed:', message);
}

/** Item 9 calls this when a brokerage's data is exported. */
export async function recordClientExport(
  supabase: SupabaseClient,
  clientId: string,
  actorEmail: string,
  summary: string,
): Promise<void> {
  await recordAudit(supabase, {
    clientId,
    actorEmail,
    action: 'export',
    entity: 'client',
    entityId: clientId,
    summary,
  });
}
