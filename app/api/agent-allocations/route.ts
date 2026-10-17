import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { requireSessionClient, apiError } from '@/lib/session';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { validateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';
import { describeTeamCapKeys, normalizeTeamCapKey } from '@/lib/agent-allocations';

type CapType = 'TEAM' | 'AGENT';

type CapBody = {
  id?: string;
  name?: string;
  key?: string;
  enabled?: boolean;
  qualifyingFormula?: string | null;
  splitPercentFieldKey?: string | null;
  capAmountFieldKey?: string | null;
  resetDateFieldKey?: string | null;
  recipientAgentId?: string | null;
  hideOverAllocations?: boolean;
  commissionEntityId?: string | null;
};

type VolumeBody = {
  name?: string;
  enabled?: boolean;
  qualifyingFormula?: string | null;
  anchor?: 'sales_price' | 'sales_price_x_units';
  assignment?: 'agent_share' | 'primary_agent';
};

type StoredCap = {
  id: string;
  name: string | null;
  key: string | null;
  cap_type: string | null;
  archived: boolean | null;
};

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function capId(value: unknown): string | null {
  const id = String(value || '').trim();
  return /^(CTC|CAC)_[A-F0-9]{12}$/.test(id) ? id : null;
}

function capTypeOf(value: string | null | undefined): CapType {
  return value === 'AGENT' ? 'AGENT' : 'TEAM';
}

function defaultName(capType: CapType): string {
  return capType === 'AGENT' ? 'Agent Cap' : 'Team Cap';
}

function errorParts(error: unknown): { raw: string; code: string } {
  const raw = error instanceof Error
    ? error.message
    : error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message || '')
      : '';
  const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
  return { raw, code };
}

function capsSchemaMissing(error: unknown): boolean {
  const { raw, code } = errorParts(error);
  if (code === '42P01' || code === 'PGRST205') return /client_caps/.test(raw);
  if (code === 'PGRST204') return /cap_type|hide_over_allocations|commission_entity_id/.test(raw);
  return false;
}

function capRow(clientId: string, body: CapBody, user: string, key: string, capType: CapType) {
  const agent = capType === 'AGENT';
  return {
    client_id: clientId,
    name: clean(body.name) || defaultName(capType),
    key,
    cap_type: capType,
    enabled: Boolean(body.enabled),
    qualifying_formula: agent ? null : clean(body.qualifyingFormula),
    split_percent_field_key: agent ? null : clean(body.splitPercentFieldKey),
    cap_amount_field_key: clean(body.capAmountFieldKey),
    reset_date_field_key: clean(body.resetDateFieldKey),
    recipient_agent_id: agent ? null : clean(body.recipientAgentId),
    hide_over_allocations: agent ? Boolean(body.hideOverAllocations) : false,
    commission_entity_id: agent ? clean(body.commissionEntityId) : null,
    updated_at: new Date().toISOString(),
    updated_by: user,
  };
}

function volumeRow(clientId: string, body: VolumeBody, user: string) {
  const anchor = body.anchor === 'sales_price_x_units' ? 'sales_price_x_units' : 'sales_price';
  const assignment = body.assignment === 'primary_agent' ? 'primary_agent' : 'agent_share';
  return {
    client_id: clientId,
    name: clean(body.name) || 'Agent Allocation',
    enabled: Boolean(body.enabled),
    qualifying_formula: clean(body.qualifyingFormula),
    anchor,
    assignment,
    updated_at: new Date().toISOString(),
    updated_by: user,
  };
}

async function upsertOne(
  supabase: Awaited<ReturnType<typeof getAuthenticatedSupabase>>,
  table: 'client_sales_volume_assignments',
  clientId: string,
  row: Record<string, unknown>,
  user: string,
) {
  const { data: existing, error: readError } = await supabase
    .from(table)
    .select('id')
    .eq('client_id', clientId)
    .or('archived.is.null,archived.eq.false')
    .limit(1)
    .maybeSingle();
  if (readError) throw readError;
  if (existing?.id) {
    const { error } = await supabase.from(table).update(row).eq('id', existing.id).eq('client_id', clientId);
    if (error) throw error;
    return;
  }
  const { error } = await supabase.from(table).insert({ ...row, created_by: user });
  if (error) throw error;
}

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { clientId, supabase } = await requireSessionClient();
    const [capsResult, salesVolume] = await Promise.all([
      supabase.from('client_caps').select('*').eq('client_id', clientId).or('archived.is.null,archived.eq.false').order('created_at', { ascending: true }),
      supabase.from('client_sales_volume_assignments').select('*').eq('client_id', clientId).or('archived.is.null,archived.eq.false').limit(1).maybeSingle(),
    ]);
    // Until migration 048 renames the table, keep reading the current team caps.
    const caps = capsResult.error && capsSchemaMissing(capsResult.error)
      ? await supabase.from('client_team_caps' as 'client_caps').select('*').eq('client_id', clientId).or('archived.is.null,archived.eq.false').order('created_at', { ascending: true })
      : capsResult;
    if (caps.error) throw caps.error;
    if (salesVolume.error) throw salesVolume.error;
    const rows = caps.data || [];
    return NextResponse.json({
      success: true,
      teamCaps: rows.filter((row) => capTypeOf(row.cap_type) === 'TEAM'),
      agentCaps: rows.filter((row) => capTypeOf(row.cap_type) === 'AGENT'),
      salesVolume: salesVolume.data,
    });
  } catch (error) {
    if (capsSchemaMissing(error)) {
      return NextResponse.json({ error: 'Run migration 048 before loading caps.' }, { status: 500 });
    }
    return apiError(error, 'The allocation settings could not be loaded.');
  }
}

async function saveCaps(
  supabase: Awaited<ReturnType<typeof getAuthenticatedSupabase>>,
  clientId: string,
  user: string,
  capType: CapType,
  caps: CapBody[],
  stored: StoredCap[],
) {
  const storedById = new Map(stored.map((row) => [row.id, row]));
  const resolved = caps.map((cap) => {
    const id = capId(cap.id);
    const existing = id ? storedById.get(id) : undefined;
    const storedKey = existing ? normalizeTeamCapKey(String(existing.key || '')) : '';
    return {
      cap,
      id,
      key: storedKey || normalizeTeamCapKey(String(cap.key || '')),
    };
  });
  for (const item of resolved) {
    if (!item.id) continue;
    const existing = storedById.get(item.id);
    if (existing && capTypeOf(existing.cap_type) !== capType) {
      return `${defaultName(capType)}: That cap is already used on the other list.`;
    }
  }
  const keyProblem = describeTeamCapKeys(resolved.map((item) => ({
    name: clean(item.cap.name) || defaultName(capType),
    key: item.key,
  })));
  if (keyProblem) {
    const label = clean(resolved[keyProblem.index]?.cap.name) || defaultName(capType);
    return `${label}: ${keyProblem.message}`;
  }
  const otherKeys = new Map<string, string>();
  for (const row of stored) {
    if (row.archived) continue;
    if (capTypeOf(row.cap_type) === capType) continue;
    const key = normalizeTeamCapKey(String(row.key || ''));
    if (key) otherKeys.set(key, clean(row.name) || defaultName(capTypeOf(row.cap_type)));
  }
  for (const item of resolved) {
    const other = otherKeys.get(item.key);
    if (!other) continue;
    const label = clean(item.cap.name) || defaultName(capType);
    return `${label}: That key is already used by ${other}.`;
  }
  const keptIds: string[] = [];
  for (const item of resolved) {
    const { cap, id } = item;
    const row = capRow(clientId, cap, user, item.key, capType);
    if (id) {
      const { data: existing, error: readError } = await supabase
        .from('client_caps')
        .select('id')
        .eq('id', id)
        .eq('client_id', clientId)
        .maybeSingle();
      if (readError) throw readError;
      if (existing?.id) {
        const { error } = await supabase.from('client_caps').update({ ...row, archived: false }).eq('id', id).eq('client_id', clientId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('client_caps').insert({ ...row, id, created_by: user });
        if (error) throw error;
      }
      keptIds.push(id);
      continue;
    }
    const { data: inserted, error } = await supabase.from('client_caps').insert({ ...row, created_by: user }).select('id').single();
    if (error) throw error;
    if (inserted?.id) keptIds.push(inserted.id);
  }
  const { data: currentCaps, error: listError } = await supabase
    .from('client_caps')
    .select('id, cap_type')
    .eq('client_id', clientId)
    .or('archived.is.null,archived.eq.false');
  if (listError) throw listError;
  for (const current of currentCaps || []) {
    if (capTypeOf(current.cap_type) !== capType || keptIds.includes(current.id)) continue;
    const { error } = await supabase.from('client_caps').update({ archived: true, updated_at: new Date().toISOString(), updated_by: user }).eq('id', current.id).eq('client_id', clientId);
    if (error) throw error;
  }
  return null;
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { clientId, supabase } = await requireSessionClient();
    const user = session.user.email;
    const { data: fields, error: fieldsError } = await supabase
      .from('client_field_configurations')
      .select('field_key')
      .eq('client_id', clientId)
      .eq('target_table', 'transactions');
    if (fieldsError) throw fieldsError;
    const knownNames = ['transaction_status', 'finance_status', 'closing_date', 'acceptance_date', 'list_date', 'status'];
    (fields || []).forEach((field) => {
      if (field.field_key) knownNames.push(String(field.field_key));
    });
    const saveTeamCaps = Array.isArray(body.teamCaps);
    const saveAgentCaps = Array.isArray(body.agentCaps);
    const saveVolume = body.salesVolume != null && typeof body.salesVolume === 'object';
    const teamCaps = saveTeamCaps ? body.teamCaps as CapBody[] : [];
    const agentCaps = saveAgentCaps ? body.agentCaps as CapBody[] : [];
    const volumeBody = saveVolume ? body.salesVolume as VolumeBody : {};
    const recipientIds = [...new Set(teamCaps.map((cap) => clean(cap.recipientAgentId)).filter((id): id is string => Boolean(id)))];
    if (recipientIds.length > 0) {
      const { data: recipients, error: recipientsError } = await supabase
        .from('agents')
        .select('id')
        .eq('client_id', clientId)
        .in('id', recipientIds);
      if (recipientsError) throw recipientsError;
      const knownRecipients = new Set((recipients || []).map((agent) => agent.id));
      for (const cap of teamCaps) {
        const recipientId = clean(cap.recipientAgentId);
        if (recipientId && !knownRecipients.has(recipientId)) {
          return NextResponse.json({ error: `${clean(cap.name) || 'Team Cap'}: Choose an agent for this cap.` }, { status: 400 });
        }
      }
    }
    const entityIds = [...new Set(agentCaps.map((cap) => clean(cap.commissionEntityId)).filter((id): id is string => Boolean(id)))];
    if (entityIds.length > 0) {
      const { data: entities, error: entitiesError } = await supabase
        .from('commission_entities')
        .select('id')
        .eq('client_id', clientId)
        .in('id', entityIds);
      if (entitiesError) throw entitiesError;
      const knownEntities = new Set((entities || []).map((entity) => entity.id));
      for (const cap of agentCaps) {
        const entityId = clean(cap.commissionEntityId);
        if (entityId && !knownEntities.has(entityId)) {
          return NextResponse.json({ error: `${clean(cap.name) || 'Agent Cap'}: Choose a post-split entity for this cap.` }, { status: 400 });
        }
      }
    }
    for (const cap of teamCaps) {
      const label = clean(cap.name) || 'Team Cap';
      const teamError = validateFormula(String(cap.qualifyingFormula || ''), knownNames);
      if (teamError) return NextResponse.json({ error: `${label}: ${teamError}` }, { status: 400 });
    }
    if (saveVolume) {
      const volumeError = validateFormula(String(volumeBody.qualifyingFormula || ''), knownNames);
      if (volumeError) return NextResponse.json({ error: `Agent allocation: ${volumeError}` }, { status: 400 });
    }
    let stored: StoredCap[] = [];
    if (saveTeamCaps || saveAgentCaps) {
      const { data: storedCaps, error: storedCapsError } = await supabase
        .from('client_caps')
        .select('id, name, key, cap_type, archived')
        .eq('client_id', clientId);
      if (storedCapsError) throw storedCapsError;
      stored = storedCaps || [];
    }
    if (saveTeamCaps) {
      const problem = await saveCaps(supabase, clientId, user, 'TEAM', teamCaps, stored);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (saveAgentCaps) {
      const problem = await saveCaps(supabase, clientId, user, 'AGENT', agentCaps, stored);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (saveVolume) {
      await upsertOne(supabase, 'client_sales_volume_assignments', clientId, volumeRow(clientId, volumeBody, user), user);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const { raw, code } = errorParts(error);
    if (capsSchemaMissing(error)) {
      console.error(error);
      return NextResponse.json({ error: 'Run migration 048 before saving caps.' }, { status: 500 });
    }
    if (code === '23505') {
      return NextResponse.json({ error: 'That key is already used by another cap.' }, { status: 400 });
    }
    if (/key/.test(raw) && (/schema cache/i.test(raw) || /does not exist/i.test(raw))) {
      console.error(error);
      return NextResponse.json({ error: 'Run migration 043 before saving a team cap key.' }, { status: 500 });
    }
    return apiError(error, 'The allocation settings could not be saved.');
  }
}
