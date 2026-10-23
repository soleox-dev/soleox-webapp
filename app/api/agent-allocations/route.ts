import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { requireSessionClient, apiError } from '@/lib/session';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { validateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';
import { capRecipientsFromRow, describeTeamCapKeys, normalizeTeamCapKey, type CapPayoutRule } from '@/lib/agent-allocations';

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
  /** The agents a team cap pays and their shares in percent, adding up to 100. Used when payoutRules is absent. */
  recipients?: RecipientBody[] | null;
  /** Who a team cap pays, in order: a deal uses the first rule whose condition is true or blank. */
  payoutRules?: { name?: string | null; condition?: string | null; recipients?: RecipientBody[] | null }[] | null;
  /** Another team cap this one counts toward. */
  progressCapId?: string | null;
  hideOverAllocations?: boolean;
  commissionEntityId?: string | null;
};

type RecipientBody = { agentId?: string; share?: number | string };

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

/** The migration a save needs when a team cap column is missing: 078 (payout rules) or 075 (recipients, Counts Toward). */
function missingCapMigration(error: unknown): string | null {
  const { raw, code } = errorParts(error);
  if (code !== '42703' && code !== 'PGRST204') return null;
  if (/payout_rules/.test(raw)) return '078';
  if (/recipients|progress_cap_id/.test(raw)) return '075';
  return null;
}

function recipientsFromBody(listed: RecipientBody[] | null | undefined) {
  return capRecipientsFromRow((listed || []).map((item) => ({ agent_id: clean(item?.agentId), share: Number(item?.share) })), null);
}

/** A team cap's payout rules from the request, or one rule with no condition from its recipients. */
function bodyPayoutRules(body: CapBody): CapPayoutRule[] {
  if (Array.isArray(body.payoutRules)) {
    return body.payoutRules.map((rule) => ({ name: clean(rule?.name), condition: clean(rule?.condition), recipients: recipientsFromBody(rule?.recipients) }));
  }
  const recipients = Array.isArray(body.recipients) ? recipientsFromBody(body.recipients) : capRecipientsFromRow(null, clean(body.recipientAgentId));
  return recipients.length > 0 ? [{ name: null, condition: null, recipients }] : [];
}

/** What is wrong with a team cap's payout rules, or null. */
function payoutRulesProblem(body: CapBody): string | null {
  const rules = Array.isArray(body.payoutRules)
    ? body.payoutRules
    : [{ condition: null, recipients: Array.isArray(body.recipients) ? body.recipients : [] }];
  for (const [index, rule] of rules.entries()) {
    const listed = Array.isArray(rule?.recipients) ? rule.recipients : [];
    // A single rule may stay empty while the cap is being set up; with several, each one pays someone.
    const problem = rules.length > 1 && listed.length === 0 ? 'Choose an agent for this rule.' : recipientsProblem(listed);
    if (problem) return rules.length > 1 ? `Payout rule ${index + 1}: ${problem}` : problem;
    // A rule with no condition matches every deal, so a rule after it could never pay.
    if (!clean(rule?.condition) && index < rules.length - 1) {
      return `Payout rule ${index + 1} has no condition, so the rules after it never apply. Give it a condition or move it last.`;
    }
  }
  return null;
}

/** What is wrong with one payout rule's recipients, or null. */
function recipientsProblem(listed: RecipientBody[]): string | null {
  const ids = listed.map((item) => clean(item?.agentId)).filter(Boolean);
  if (ids.length !== listed.length) return 'Choose an agent for each recipient.';
  if (new Set(ids).size !== ids.length) return 'Each agent can be a recipient only once.';
  if (listed.some((item) => !(Number(item?.share) > 0))) return 'Each recipient needs a share above 0%.';
  const total = listed.reduce((sum, item) => sum + Number(item?.share), 0);
  if (listed.length > 0 && Math.abs(total - 100) > 0.001) return `The recipients' shares add up to ${Number(total.toFixed(3))}%. They need to add up to 100%.`;
  return null;
}

/** True when migration 073 (the caps' saved order) has not been run yet. */
function sortOrderMissing(error: unknown): boolean {
  const { raw, code } = errorParts(error);
  return (code === '42703' || code === 'PGRST204') && /sort_order/.test(raw);
}

function capRow(clientId: string, body: CapBody, user: string, key: string, capType: CapType, sortOrder: number) {
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
    ...(agent ? { recipient_agent_id: null } : (() => {
      const rules = bodyPayoutRules(body);
      const stored = (recipients: CapPayoutRule['recipients']) => recipients.map((recipient) => ({ agent_id: recipient.agentId, share: recipient.share }));
      const first = rules[0]?.recipients ?? [];
      return {
        recipient_agent_id: first[0]?.agentId ?? null,
        recipients: stored(first),
        payout_rules: rules.map((rule) => ({ name: rule.name, condition: rule.condition, recipients: stored(rule.recipients) })),
        progress_cap_id: capId(body.progressCapId),
      };
    })()),
    hide_over_allocations: agent ? Boolean(body.hideOverAllocations) : false,
    commission_entity_id: agent ? clean(body.commissionEntityId) : null,
    sort_order: sortOrder,
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
    // Caps come in the order chosen in Settings › Caps; before migration 073 adds that order, by creation date.
    const listCaps = () => supabase.from('client_caps').select('*').eq('client_id', clientId).or('archived.is.null,archived.eq.false');
    const [orderedCaps, salesVolume] = await Promise.all([
      listCaps().order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: true }),
      supabase.from('client_sales_volume_assignments').select('*').eq('client_id', clientId).or('archived.is.null,archived.eq.false').limit(1).maybeSingle(),
    ]);
    const capsResult = orderedCaps.error && sortOrderMissing(orderedCaps.error)
      ? await listCaps().order('created_at', { ascending: true })
      : orderedCaps;
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

function withoutOrder(row: Record<string, unknown>): Record<string, unknown> {
  const { sort_order: _order, ...rest } = row;
  void _order;
  return rest;
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
  // Each cap's place in the list is saved as its order. Before migration 073 there is no column for it, so
  // the write is retried without it.
  let orderSaved = true;
  const write = async <R extends { error: unknown }>(run: (row: Record<string, unknown>) => PromiseLike<R>, row: Record<string, unknown>): Promise<R> => {
    const attempt = await run(orderSaved ? row : withoutOrder(row));
    if (attempt.error && orderSaved && sortOrderMissing(attempt.error)) {
      orderSaved = false;
      return run(withoutOrder(row));
    }
    return attempt;
  };
  for (const [index, item] of resolved.entries()) {
    const { cap, id } = item;
    const row = capRow(clientId, cap, user, item.key, capType, index);
    if (id) {
      const { data: existing, error: readError } = await supabase
        .from('client_caps')
        .select('id')
        .eq('id', id)
        .eq('client_id', clientId)
        .maybeSingle();
      if (readError) throw readError;
      if (existing?.id) {
        const { error } = await write((values) => supabase.from('client_caps').update(values).eq('id', id).eq('client_id', clientId), { ...row, archived: false });
        if (error) throw error;
      } else {
        const { error } = await write((values) => supabase.from('client_caps').insert(values), { ...row, id, created_by: user });
        if (error) throw error;
      }
      keptIds.push(id);
      continue;
    }
    const { data: inserted, error } = await write((values) => supabase.from('client_caps').insert(values).select('id').single(), { ...row, created_by: user });
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
    for (const cap of teamCaps) {
      const problem = payoutRulesProblem(cap);
      if (problem) return NextResponse.json({ error: `${clean(cap.name) || 'Team Cap'}: ${problem}` }, { status: 400 });
    }
    // A cap counts toward another team cap on this list, and that cap does not itself count toward a third.
    for (const cap of teamCaps) {
      const target = capId(cap.progressCapId);
      if (!target) continue;
      const label = clean(cap.name) || 'Team Cap';
      const other = teamCaps.find((item) => capId(item.id) === target);
      if (!other || target === capId(cap.id)) {
        return NextResponse.json({ error: `${label}: Choose another team cap for Counts Toward.` }, { status: 400 });
      }
      if (capId(other.progressCapId)) {
        return NextResponse.json({ error: `${label}: ${clean(other.name) || 'That cap'} already counts toward another cap. Choose the cap it counts toward instead.` }, { status: 400 });
      }
    }
    const recipientIds = [...new Set(teamCaps.flatMap((cap) => bodyPayoutRules(cap).flatMap((rule) => rule.recipients.map((recipient) => recipient.agentId))))];
    if (recipientIds.length > 0) {
      const { data: recipients, error: recipientsError } = await supabase
        .from('agents')
        .select('id')
        .eq('client_id', clientId)
        .in('id', recipientIds);
      if (recipientsError) throw recipientsError;
      const knownRecipients = new Set((recipients || []).map((agent) => agent.id));
      for (const cap of teamCaps) {
        if (bodyPayoutRules(cap).some((rule) => rule.recipients.some((recipient) => !knownRecipients.has(recipient.agentId)))) {
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
      for (const [index, rule] of bodyPayoutRules(cap).entries()) {
        const conditionError = rule.condition ? validateFormula(rule.condition, knownNames) : null;
        if (conditionError) return NextResponse.json({ error: `${label}: Payout rule ${index + 1}: ${conditionError}` }, { status: 400 });
      }
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
    const capMigration = missingCapMigration(error);
    if (capMigration) {
      console.error(error);
      return NextResponse.json({ error: `Run migration ${capMigration} before saving team caps.` }, { status: 500 });
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
