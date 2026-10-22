import type { SupabaseClient } from '@supabase/supabase-js';
import { DB_AGENT_COLUMNS } from '@/lib/fields';
import { fromPercentPoints, roundPercentRate } from '@/lib/percent';
import { coerceSyncValue } from '@/lib/transaction-sync';

const READ_ONLY_KEYS = new Set([
  'id',
  'agent_id',
  'client_id',
  'user_id',
  'archived',
  'custom_attributes',
  // Set from the Edit Agent form, which checks the plan belongs to the client.
  'commission_plan_id',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
]);

const MAX_BULK_IDS = 500;

export function isAgentBulkEditableField(field: {
  field_key?: string | null;
  is_enabled?: boolean | null;
}): boolean {
  const fieldKey = String(field.field_key || '').trim();
  if (!fieldKey || READ_ONLY_KEYS.has(fieldKey)) return false;
  if (field.is_enabled === false) return false;
  return true;
}

type AgentField = {
  field_key?: string | null;
  field_label?: string | null;
  field_type?: string | null;
  storage_type?: string | null;
  is_required?: boolean | null;
  is_enabled?: boolean | null;
  dropdown_options?: string[] | null;
};

export interface AgentBulkResult {
  updated: number;
  unchanged: number;
  skipped: number;
  deleted: string[];
  errors: { id: string; message: string }[];
  rows: Record<string, unknown>[];
}

function storageTypeFor(fieldKey: string, configured?: string | null): 'CORE_COLUMN' | 'CUSTOM_JSON' {
  if (DB_AGENT_COLUMNS.some((column) => column.field_key === fieldKey)) return 'CORE_COLUMN';
  return configured === 'CORE_COLUMN' ? 'CORE_COLUMN' : 'CUSTOM_JSON';
}

function parseCustom(value: unknown): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return { ...(value as Record<string, unknown>) };
  return {};
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (left == null && right == null) return true;
  if (typeof left === 'number' && typeof right === 'number') return left === right;
  return String(left ?? '') === String(right ?? '');
}

function flattenAgent(row: Record<string, unknown>): Record<string, unknown> {
  return { ...row, ...parseCustom(row.custom_attributes) };
}

export async function bulkUpdateAgents(
  sb: SupabaseClient,
  input: {
    clientId: string;
    userId: string;
    ids: string[];
    fieldKey: string;
    rawValue: string;
  },
): Promise<AgentBulkResult> {
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error('Choose at least one agent.');
  if (ids.length > MAX_BULK_IDS) throw new Error(`Choose ${MAX_BULK_IDS} agents or fewer.`);

  const { data: fieldRows, error: fieldError } = await sb
    .from('client_field_configurations')
    .select('field_key, field_label, field_type, storage_type, is_required, is_enabled, dropdown_options')
    .eq('client_id', input.clientId)
    .eq('target_table', 'agents')
    .or('archived.is.null,archived.eq.false');
  if (fieldError) throw new Error(fieldError.message);

  const match = ((fieldRows || []) as AgentField[]).find((field) => String(field.field_key || '').trim() === input.fieldKey);
  if (!match || !isAgentBulkEditableField(match)) throw new Error('That field cannot be updated in bulk.');

  const fieldKey = String(match.field_key).trim();
  const fieldLabel = String(match.field_label || fieldKey);
  const fieldType = String(match.field_type || 'TEXT').toUpperCase();
  const storage = storageTypeFor(fieldKey, match.storage_type);
  const options = Array.isArray(match.dropdown_options) ? match.dropdown_options.map((option) => String(option)).filter(Boolean) : [];

  const text = input.rawValue.trim();
  let value: unknown = null;
  if (text) {
    if (fieldType === 'PERCENT') {
      const amount = Number(text.replace(/[%,$\s,]/g, ''));
      if (!Number.isFinite(amount)) throw new Error(`${fieldLabel} is not a percent.`);
      value = roundPercentRate(fromPercentPoints(amount));
    } else if (fieldType === 'SELECT' && options.length > 0 && !options.includes(text)) {
      throw new Error(`${text} is not a ${fieldLabel} option.`);
    } else {
      const coerced = coerceSyncValue(text, fieldKey, fieldType);
      if (coerced.ok === false) throw new Error(coerced.message);
      value = coerced.value;
    }
  }
  if (fieldKey === 'agent_name' && (value === null || String(value).trim() === '')) {
    throw new Error('Agent name is required.');
  }

  const { data, error } = await sb
    .from('agents')
    .select('*')
    .eq('client_id', input.clientId)
    .in('id', ids);
  if (error) throw new Error(error.message);

  const found = (data || []) as Record<string, unknown>[];
  const foundIds = new Set(found.map((row) => String(row.id)));
  const result: AgentBulkResult = {
    updated: 0,
    unchanged: 0,
    skipped: ids.filter((id) => !foundIds.has(id)).length,
    deleted: [],
    errors: [],
    rows: [],
  };

  const now = new Date().toISOString();
  const nativeIds: string[] = [];
  const customWrites: { id: string; custom: Record<string, unknown>; next: Record<string, unknown> }[] = [];

  found.forEach((row) => {
    if (row.archived === true) {
      result.skipped += 1;
      return;
    }
    const current = storage === 'CUSTOM_JSON' ? parseCustom(row.custom_attributes)[fieldKey] : row[fieldKey];
    if (sameValue(current, value)) {
      result.unchanged += 1;
      return;
    }
    if (storage === 'CUSTOM_JSON') {
      const custom = parseCustom(row.custom_attributes);
      if (value === null) delete custom[fieldKey];
      else custom[fieldKey] = value;
      customWrites.push({ id: String(row.id), custom, next: flattenAgent({ ...row, custom_attributes: custom }) });
      return;
    }
    nativeIds.push(String(row.id));
  });

  if (nativeIds.length > 0) {
    const payload: Record<string, unknown> = {
      [fieldKey]: value,
      updated_at: now,
      updated_by: input.userId,
    };
    const { data: saved, error: writeError } = await sb
      .from('agents')
      .update(payload)
      .eq('client_id', input.clientId)
      .in('id', nativeIds)
      .select('*');
    if (writeError) throw new Error(writeError.message);
    result.rows.push(...(saved || []).map((row) => flattenAgent(row as Record<string, unknown>)));
    result.updated += (saved || []).length;
  }

  for (const write of customWrites) {
    const { data: saved, error: writeError } = await sb
      .from('agents')
      .update({ custom_attributes: write.custom, updated_at: now, updated_by: input.userId })
      .eq('client_id', input.clientId)
      .eq('id', write.id)
      .select('*');
    if (writeError) {
      result.errors.push({ id: write.id, message: writeError.message });
      continue;
    }
    result.rows.push(...(saved || []).map((row) => flattenAgent(row as Record<string, unknown>)));
    result.updated += 1;
  }

  return result;
}

async function agentIdsOnDeals(sb: SupabaseClient, clientId: string, ids: string[]): Promise<Set<string>> {
  const busy = new Set<string>();
  const [transactions, items] = await Promise.all([
    sb.from('transactions').select('agent_id').eq('client_id', clientId).in('agent_id', ids).or('archived.is.null,archived.eq.false'),
    sb.from('transaction_commission_items').select('agent_id').eq('client_id', clientId).in('agent_id', ids).or('archived.is.null,archived.eq.false'),
  ]);
  if (transactions.error) throw new Error(transactions.error.message);
  if (items.error) throw new Error(items.error.message);
  (transactions.data || []).forEach((row) => {
    if (row.agent_id) busy.add(String(row.agent_id));
  });
  (items.data || []).forEach((row) => {
    if (row.agent_id) busy.add(String(row.agent_id));
  });
  return busy;
}

export async function bulkDeleteAgents(
  sb: SupabaseClient,
  input: { clientId: string; userId: string; ids: string[] },
): Promise<AgentBulkResult> {
  const ids = [...new Set(input.ids.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) throw new Error('Choose at least one agent.');
  if (ids.length > MAX_BULK_IDS) throw new Error(`Choose ${MAX_BULK_IDS} agents or fewer.`);

  const busy = await agentIdsOnDeals(sb, input.clientId, ids);
  const removable = ids.filter((id) => !busy.has(id));
  const result: AgentBulkResult = {
    updated: 0,
    unchanged: 0,
    skipped: busy.size,
    deleted: [],
    errors: [...busy].map((id) => ({ id, message: 'This agent is on a transaction.' })),
    rows: [],
  };

  if (removable.length === 0) return result;

  const { data, error } = await sb
    .from('agents')
    .update({
      archived: true,
      agent_status: 'Terminated',
      updated_at: new Date().toISOString(),
      updated_by: input.userId,
    })
    .eq('client_id', input.clientId)
    .in('id', removable)
    .select('id');
  if (error) throw new Error(error.message);

  result.deleted = (data || []).map((row) => String(row.id));
  const deleted = new Set(result.deleted);
  removable.filter((id) => !deleted.has(id)).forEach((id) => {
    result.errors.push({ id, message: 'Could not delete this agent.' });
  });
  return result;
}
