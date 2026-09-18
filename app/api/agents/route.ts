import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

const NATIVE_AGENT_COLUMNS = new Set([
  'id',
  'agent_id',
  'client_id',
  'user_id',
  'tms_id',
  'agent_name',
  'agent_email',
  'agent_phone',
  'phone',
  'group_id',
  'agent_status',
  'is_team_lead',
  'agent_onboard_date',
  'agent_offboard_date',
  'commission_attributes',
  'custom_attributes',
  'archived',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
  'broker_cap_limit',
  'broker_cap_paid_ytd',
  'anniversary_date',
]);

// GET: Fetch active agents
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const clientId = request.headers.get('x-client-id') || request.headers.get('client_id') || searchParams.get('client_id') || 'DEMO';

    const includeArchived = searchParams.get('include_archived') === 'true';

    const supabase = await getAuthenticatedSupabase();
    let query = supabase
      .from('agents')
      .select('*')
      .eq('client_id', clientId);

    if (!includeArchived) {
      query = query.or('archived.is.null,archived.eq.false');
    }

    const { data, error } = await query.order('agent_name', { ascending: true });

    if (error) throw error;

    // Flatten custom and commission attributes onto the returned objects
    const formattedAgents = (data || []).map((row: any) => {
      let customAttrs = {};
      let commAttrs = {};

      try {
        if (row.custom_attributes) {
          customAttrs = typeof row.custom_attributes === 'string' 
            ? JSON.parse(row.custom_attributes) 
            : row.custom_attributes;
        }
        if (row.commission_attributes) {
          commAttrs = typeof row.commission_attributes === 'string' 
            ? JSON.parse(row.commission_attributes) 
            : row.commission_attributes;
        }
      } catch (e) {
        console.warn('JSON parse error on agent row:', e);
      }

      return { ...row, ...customAttrs, ...commAttrs };
    });

    // Deduplicate agents by normalized agent_name (keeps the most recent / non-archived record)
    const KNOWN_CANONICAL_IDS: Record<string, string> = {
      'brennan devon': 'AGT_A8C5F636713A',
      'robert ito': 'AGT_B45B9A8A0322',
      'christa tyler': 'AGT_77ABA1E7C0B7',
      'sarah conner': 'AGT_DEMO_01',
    };

    const agentMapByName = new Map<string, any>();
    formattedAgents.forEach((ag: any) => {
      const normName = (ag.agent_name || ag.name || '').trim().toLowerCase();
      if (!normName) return;

      const canonicalId = KNOWN_CANONICAL_IDS[normName];
      const existing = agentMapByName.get(normName);
      if (!existing) {
        agentMapByName.set(normName, ag);
        return;
      }

      if (canonicalId) {
        if (ag.id === canonicalId) {
          agentMapByName.set(normName, ag);
        }
        return;
      }

      // Prefer non-archived over archived
      if (existing.archived && !ag.archived) {
        agentMapByName.set(normName, ag);
      } else if (!existing.archived && ag.archived) {
        // Keep existing non-archived
      } else {
        // Both non-archived or both archived: prefer the newer record
        const existingTime = new Date(existing.created_at || 0).getTime();
        const agTime = new Date(ag.created_at || 0).getTime();
        if (agTime >= existingTime) {
          agentMapByName.set(normName, ag);
        }
      }
    });

    const deduplicatedAgents = Array.from(agentMapByName.values()).sort((a, b) =>
      (a.agent_name || '').localeCompare(b.agent_name || '', undefined, { sensitivity: 'base' })
    );

    return NextResponse.json({ success: true, agents: deduplicatedAgents });
  } catch (error: any) {
    console.error('Error fetching agents:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// POST: Create or Update Agent
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const supabase = await getAuthenticatedSupabase();
    const body = await request.json();
    const agent = body.agent || body;

    // 1. Validation: Name is required. ID is ONLY required for updates.
    if (!agent || !agent.agent_name) {
      return NextResponse.json({ error: 'Agent Name is required' }, { status: 400 });
    }

    const existingId = agent.id || agent.agent_id ? String(agent.id || agent.agent_id) : null;
    const isUpdate = Boolean(existingId);
    const clientId = String(agent.client_id || 'DEMO');
    const user = session.user.email || agent.updated_by || agent.created_by || 'system_admin';

    // 2. Separate custom non-native attributes
    const customAttributes: Record<string, any> = {};
    const commissionAttributes: Record<string, any> = {
      broker_cap_limit: Number(agent.broker_cap_limit || 8000),
      broker_cap_paid_ytd: Number(agent.broker_cap_paid_ytd || 0),
      anniversary_date: agent.anniversary_date || null,
    };

    Object.keys(agent).forEach((key) => {
      if (!NATIVE_AGENT_COLUMNS.has(key)) {
        customAttributes[key] = agent[key];
      }
    });

    const sanitizeDate = (val?: string) =>
      val && String(val).trim() !== '' ? String(val).substring(0, 10) : null;

    // 3. Format payload matching Postgres types
    const rowPayload: Record<string, any> = {
      client_id: clientId,
      user_id: agent.user_id ? String(agent.user_id) : null,
      tms_id: agent.tms_id ? String(agent.tms_id) : null,
      agent_name: String(agent.agent_name),
      agent_email: agent.agent_email ? String(agent.agent_email) : '',
      agent_phone: agent.agent_phone || agent.phone ? String(agent.agent_phone || agent.phone) : null,
      group_id: agent.group_id ? String(agent.group_id) : null,
      agent_status: String(agent.agent_status || 'Active'),
      is_team_lead: Boolean(agent.is_team_lead),
      agent_onboard_date: sanitizeDate(agent.agent_onboard_date),
      agent_offboard_date: sanitizeDate(agent.agent_offboard_date),
      commission_attributes: commissionAttributes,
      custom_attributes: customAttributes,
      archived: Boolean(agent.archived),
      created_by: agent.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    // Include ID ONLY if we are performing an UPDATE
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // 4. Insert or Upsert
    let query;
    if (isUpdate) {
      // Update existing record
      query = supabase
        .from('agents')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new record (Postgres will invoke generate_prefixed_id('AGT'))
      query = supabase
        .from('agents')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;

    return NextResponse.json({
      success: true,
      message: `Agent ${isUpdate ? 'updated' : 'created'} successfully`,
      agent: {
        ...returnedRow,
        ...customAttributes,
        ...commissionAttributes,
      },
    });
  } catch (error: any) {
    console.error('Supabase Agents Save Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}

// DELETE: Archive an Agent
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const clientId = searchParams.get('client_id') || 'DEMO';

    if (!id) {
      return NextResponse.json({ error: 'Agent ID is required' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { error } = await supabase
      .from('agents')
      .update({
        archived: true,
        agent_status: 'Terminated',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('client_id', clientId);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Agent archived successfully' });
  } catch (error: any) {
    console.error('Supabase Agent Delete Error:', error);
    const status = error.message?.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ error: error.message }, { status });
  }
}
