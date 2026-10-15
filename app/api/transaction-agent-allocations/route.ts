import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

type AllocationBody = {
  agentId?: string;
  amount?: number;
  calculatedAmount?: number;
  isOverride?: boolean;
};

export async function GET(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const url = new URL(request.url);
    const clientId = url.searchParams.get('client_id') || request.headers.get('x-client-id') || 'DEMO';
    const transactionId = url.searchParams.get('transaction_id') || '';
    if (!transactionId) return NextResponse.json({ error: 'A transaction is required.' }, { status: 400 });
    const supabase = await getAuthenticatedSupabase();
    const { data, error } = await supabase
      .from('transaction_agent_allocations')
      .select('id, agent_id, amount, calculated_amount, is_override')
      .eq('client_id', clientId)
      .eq('transaction_id', transactionId);
    if (error) throw error;
    return NextResponse.json({ success: true, allocations: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The agent allocations could not be loaded.';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const body = await request.json();
    const clientId = String(body.clientId || request.headers.get('x-client-id') || 'DEMO');
    const transactionId = String(body.transactionId || '');
    const rows = Array.isArray(body.allocations) ? body.allocations as AllocationBody[] : [];
    if (!transactionId) return NextResponse.json({ error: 'A transaction is required.' }, { status: 400 });
    const supabase = await getAuthenticatedSupabase();
    const user = session.user.email;
    const now = new Date().toISOString();
    const keep = new Set<string>();

    for (const row of rows) {
      const agentId = String(row.agentId || '');
      if (!agentId) continue;
      keep.add(agentId);
      const payload = {
        client_id: clientId,
        transaction_id: transactionId,
        agent_id: agentId,
        amount: Number(row.amount) || 0,
        calculated_amount: Number(row.calculatedAmount) || 0,
        is_override: Boolean(row.isOverride),
        updated_at: now,
        updated_by: user,
      };
      const { data: existing, error: readError } = await supabase
        .from('transaction_agent_allocations')
        .select('id')
        .eq('transaction_id', transactionId)
        .eq('agent_id', agentId)
        .limit(1)
        .maybeSingle();
      if (readError) throw readError;
      if (existing?.id) {
        const { error } = await supabase.from('transaction_agent_allocations').update(payload).eq('id', existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('transaction_agent_allocations').insert({ ...payload, created_by: user });
        if (error) throw error;
      }
    }

    const { data: existingRows, error: listError } = await supabase
      .from('transaction_agent_allocations')
      .select('id, agent_id')
      .eq('client_id', clientId)
      .eq('transaction_id', transactionId);
    if (listError) throw listError;
    const removeIds = (existingRows || []).filter((row) => !keep.has(row.agent_id)).map((row) => row.id);
    if (removeIds.length > 0) {
      const { error } = await supabase.from('transaction_agent_allocations').delete().in('id', removeIds);
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The agent allocations could not be saved.';
    return NextResponse.json({ error: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}
