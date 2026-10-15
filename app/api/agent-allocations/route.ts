import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { validateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';
import { describeTeamCapKeys, normalizeTeamCapKey } from '@/lib/agent-allocations';

type TeamCapBody = {
  id?: string;
  name?: string;
  key?: string;
  enabled?: boolean;
  qualifyingFormula?: string | null;
  splitPercentFieldKey?: string | null;
  capAmountFieldKey?: string | null;
  resetDateFieldKey?: string | null;
  recipientAgentId?: string | null;
};

type VolumeBody = {
  name?: string;
  enabled?: boolean;
  qualifyingFormula?: string | null;
  anchor?: 'sales_price' | 'sales_price_x_units';
  assignment?: 'agent_share' | 'primary_agent';
};

function clean(value: unknown): string | null {
  const text = String(value ?? '').trim();
  return text || null;
}

function teamCapId(value: unknown): string | null {
  const id = String(value || '').trim();
  return /^CTC_[A-F0-9]{12}$/.test(id) ? id : null;
}

function teamCapRow(clientId: string, body: TeamCapBody, user: string, key: string) {
  return {
    client_id: clientId,
    name: clean(body.name) || 'Team Cap',
    key,
    enabled: Boolean(body.enabled),
    qualifying_formula: clean(body.qualifyingFormula),
    split_percent_field_key: clean(body.splitPercentFieldKey),
    cap_amount_field_key: clean(body.capAmountFieldKey),
    reset_date_field_key: clean(body.resetDateFieldKey),
    recipient_agent_id: clean(body.recipientAgentId),
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
  table: 'client_team_caps' | 'client_sales_volume_assignments',
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
    const clientId = new URL(request.url).searchParams.get('client_id') || request.headers.get('x-client-id') || 'DEMO';
    const supabase = await getAuthenticatedSupabase();
    const [teamCaps, salesVolume] = await Promise.all([
      supabase.from('client_team_caps').select('*').eq('client_id', clientId).or('archived.is.null,archived.eq.false').order('created_at', { ascending: true }),
      supabase.from('client_sales_volume_assignments').select('*').eq('client_id', clientId).or('archived.is.null,archived.eq.false').limit(1).maybeSingle(),
    ]);
    if (teamCaps.error) throw teamCaps.error;
    if (salesVolume.error) throw salesVolume.error;
    return NextResponse.json({ success: true, teamCaps: teamCaps.data || [], salesVolume: salesVolume.data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The allocation settings could not be loaded.';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const clientId = String(body.clientId || request.headers.get('x-client-id') || 'DEMO');
    const supabase = await getAuthenticatedSupabase();
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
    const saveVolume = body.salesVolume != null && typeof body.salesVolume === 'object';
    const teamCaps = saveTeamCaps ? body.teamCaps as TeamCapBody[] : [];
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
    for (const cap of teamCaps) {
      const label = clean(cap.name) || 'Team Cap';
      const teamError = validateFormula(String(cap.qualifyingFormula || ''), knownNames);
      if (teamError) return NextResponse.json({ error: `${label}: ${teamError}` }, { status: 400 });
    }
    const { data: storedCaps, error: storedCapsError } = await supabase
      .from('client_team_caps')
      .select('id, key')
      .eq('client_id', clientId);
    if (storedCapsError) throw storedCapsError;
    const storedKeys = new Map((storedCaps || []).map((row) => [row.id, normalizeTeamCapKey(String(row.key || ''))]));
    const resolvedCaps = teamCaps.map((cap) => {
      const id = teamCapId(cap.id);
      const storedKey = id ? storedKeys.get(id) || '' : '';
      return {
        cap,
        id,
        key: storedKey || normalizeTeamCapKey(String(cap.key || '')),
      };
    });
    const keyProblem = describeTeamCapKeys(resolvedCaps.map((item) => ({
      name: clean(item.cap.name) || 'Team Cap',
      key: item.key,
    })));
    if (keyProblem) {
      const label = clean(resolvedCaps[keyProblem.index]?.cap.name) || 'Team Cap';
      return NextResponse.json({ error: `${label}: ${keyProblem.message}` }, { status: 400 });
    }
    if (saveVolume) {
      const volumeError = validateFormula(String(volumeBody.qualifyingFormula || ''), knownNames);
      if (volumeError) return NextResponse.json({ error: `Agent allocation: ${volumeError}` }, { status: 400 });
    }
    const keptIds: string[] = [];
    if (saveTeamCaps) {
    for (const item of resolvedCaps) {
      const { cap, id } = item;
      const row = teamCapRow(clientId, cap, user, item.key);
      if (id) {
        const { data: existing, error: readError } = await supabase
          .from('client_team_caps')
          .select('id')
          .eq('id', id)
          .eq('client_id', clientId)
          .maybeSingle();
        if (readError) throw readError;
        if (existing?.id) {
          const { error } = await supabase.from('client_team_caps').update({ ...row, archived: false }).eq('id', id).eq('client_id', clientId);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('client_team_caps').insert({ ...row, id, created_by: user });
          if (error) throw error;
        }
        keptIds.push(id);
        continue;
      }
      const { data: inserted, error } = await supabase.from('client_team_caps').insert({ ...row, created_by: user }).select('id').single();
      if (error) throw error;
      if (inserted?.id) keptIds.push(inserted.id);
    }
    const { data: currentCaps, error: listError } = await supabase
      .from('client_team_caps')
      .select('id')
      .eq('client_id', clientId)
      .or('archived.is.null,archived.eq.false');
    if (listError) throw listError;
    for (const current of currentCaps || []) {
      if (keptIds.includes(current.id)) continue;
      const { error } = await supabase.from('client_team_caps').update({ archived: true, updated_at: new Date().toISOString(), updated_by: user }).eq('id', current.id).eq('client_id', clientId);
      if (error) throw error;
    }
    }
    if (saveVolume) {
      await upsertOne(supabase, 'client_sales_volume_assignments', clientId, volumeRow(clientId, volumeBody, user), user);
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    const raw = error instanceof Error
      ? error.message
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message || '')
        : '';
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code || '') : '';
    const message = code === '23505'
      ? 'That key is already used by another team cap.'
      : /key/.test(raw) && (/schema cache/i.test(raw) || /does not exist/i.test(raw))
        ? 'Run migration 043 before saving a team cap key.'
        : raw || 'The allocation settings could not be saved.';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}
