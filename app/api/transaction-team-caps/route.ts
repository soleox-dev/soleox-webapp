import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { fetchAllPages } from '@/lib/supabase-pagination';

type TeamCapBody = {
  agentId?: string;
  amount?: number;
  calculatedAmount?: number;
  isOverride?: boolean;
  periodStart?: string | null;
  teamCapId?: string | null;
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url);
    const { clientId, supabase } = await requireSessionClient();
    if (url.searchParams.get('history') === '1') {
      const agentIds = (url.searchParams.get('agent_ids') || '').split(',').map((id) => id.trim()).filter(Boolean);
      const excludeId = url.searchParams.get('exclude_transaction_id') || '';
      if (agentIds.length === 0) return NextResponse.json({ success: true, history: [] });
      const rows = await fetchAllPages((offset, limit, withCount) => {
        let query = supabase
          .from('transaction_team_caps')
          .select('agent_id, amount, period_start, transaction_id, team_cap_id', withCount ? { count: 'exact' } : undefined)
          .eq('client_id', clientId)
          .in('agent_id', agentIds);
        if (excludeId) query = query.neq('transaction_id', excludeId);
        return query.order('id', { ascending: true }).range(offset, offset + limit - 1);
      });
      return NextResponse.json({
        success: true,
        history: rows.map((row: any) => ({
          agentId: row.agent_id,
          amount: Number(row.amount) || 0,
          periodStart: row.period_start,
          teamCapId: row.team_cap_id,
          transactionId: row.transaction_id,
        })),
      });
    }
    if (url.searchParams.get('scope') === 'client') {
      const rows = await fetchAllPages((offset, limit, withCount) =>
        supabase
          .from('transaction_team_caps')
          .select('agent_id, amount, period_start, transaction_id, team_cap_id', withCount ? { count: 'exact' } : undefined)
          .eq('client_id', clientId)
          .order('id', { ascending: true })
          .range(offset, offset + limit - 1)
      );
      return NextResponse.json({
        success: true,
        contributions: rows.map((row: any) => ({
          agentId: row.agent_id,
          amount: Number(row.amount) || 0,
          periodStart: row.period_start,
          teamCapId: row.team_cap_id,
          transactionId: row.transaction_id,
        })),
      });
    }
    const transactionId = url.searchParams.get('transaction_id') || '';
    if (!transactionId) return NextResponse.json({ error: 'A transaction is required.' }, { status: 400 });
    const { data, error } = await supabase
      .from('transaction_team_caps')
      .select('id, agent_id, amount, calculated_amount, is_override, period_start, team_cap_id')
      .eq('client_id', clientId)
      .eq('transaction_id', transactionId);
    if (error) throw error;
    return NextResponse.json({ success: true, teamCaps: data || [] });
  } catch (error) {
    return apiError(error, 'The team caps could not be loaded.');
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const { clientId, supabase } = await requireSessionClient();
    const transactionId = String(body.transactionId || '');
    const rows = Array.isArray(body.teamCaps) ? body.teamCaps as TeamCapBody[] : [];
    if (!transactionId) return NextResponse.json({ error: 'A transaction is required.' }, { status: 400 });
    const user = session.user.email;
    const now = new Date().toISOString();
    const keep = new Set<string>();

    for (const row of rows) {
      const agentId = String(row.agentId || '');
      const teamCapId = String(row.teamCapId || '');
      if (!agentId || !teamCapId) continue;
      keep.add(`${agentId}:${teamCapId}`);
      const payload = {
        client_id: clientId,
        transaction_id: transactionId,
        agent_id: agentId,
        team_cap_id: teamCapId,
        amount: Number(row.amount) || 0,
        calculated_amount: Number(row.calculatedAmount) || 0,
        is_override: Boolean(row.isOverride),
        period_start: row.periodStart || null,
        updated_at: now,
        updated_by: user,
      };
      const { data: existing, error: readError } = await supabase
        .from('transaction_team_caps')
        .select('id, amount, calculated_amount, is_override, period_start')
        .eq('transaction_id', transactionId)
        .eq('agent_id', agentId)
        .eq('team_cap_id', teamCapId)
        .limit(1)
        .maybeSingle();
      if (readError) throw readError;
      // A row whose figures did not change is left alone: opening a deal re-sends every row, and rewriting them
      // would mark the client's report data as changed (migration 074) for nothing.
      const unchanged = existing?.id
        && Math.abs((Number(existing.amount) || 0) - payload.amount) < 0.005
        && Math.abs((Number(existing.calculated_amount) || 0) - payload.calculated_amount) < 0.005
        && Boolean(existing.is_override) === payload.is_override
        && String(existing.period_start || '').slice(0, 10) === String(payload.period_start || '').slice(0, 10);
      if (unchanged) continue;
      if (existing?.id) {
        const { error } = await supabase.from('transaction_team_caps').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('transaction_team_caps').insert({ ...payload, created_by: user });
        if (error) throw error;
      }
    }

    const { data: existingRows, error: listError } = await supabase
      .from('transaction_team_caps')
      .select('id, agent_id, team_cap_id')
      .eq('client_id', clientId)
      .eq('transaction_id', transactionId);
    if (listError) throw listError;
    const removeIds = (existingRows || [])
      .filter((row) => !keep.has(`${row.agent_id}:${row.team_cap_id || ''}`))
      .map((row) => row.id);
    if (removeIds.length > 0) {
      const { error } = await supabase.from('transaction_team_caps').delete().in('id', removeIds);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return apiError(error, 'The team caps could not be saved.');
  }
}
