import { NextResponse } from 'next/server';
import { requireSessionClient, apiError } from '@/lib/session';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllPages } from '@/lib/supabase-pagination';
import { inUseByPlansMessage, planUsesOfEntity, renameEntityInPlans } from '@/lib/commission-plan-references';

async function reorderPostSplitEntities(supabase: SupabaseClient, user: string, clientId: string, body: { entity_ids?: unknown }) {
  const requested = Array.isArray(body.entity_ids) ? body.entity_ids.map((id) => String(id)) : [];
  const { data: existing, error: existingError } = await supabase
    .from('commission_entities')
    .select('id')
    .eq('client_id', clientId)
    .or('archived.is.null,archived.eq.false');
  if (existingError) throw existingError;

  const allowed = new Set((existing || []).map((row) => String(row.id)));
  const ordered: string[] = [];
  for (const id of requested) {
    if (!allowed.has(id) || ordered.includes(id)) continue;
    ordered.push(id);
  }
  const orderedSet = new Set(ordered);
  const now = new Date().toISOString();
  const clearIds = [...allowed].filter((id) => !orderedSet.has(id));

  if (clearIds.length > 0) {
    const { error } = await supabase
      .from('commission_entities')
      .update({ waterfall_sort_order: null, updated_at: now, updated_by: user })
      .in('id', clearIds)
      .eq('client_id', clientId);
    if (error) throw error;
  }

  for (let index = 0; index < ordered.length; index += 1) {
    const { error } = await supabase
      .from('commission_entities')
      .update({ waterfall_sort_order: index + 1, updated_at: now, updated_by: user })
      .eq('id', ordered[index])
      .eq('client_id', clientId);
    if (error) throw error;
  }

  return NextResponse.json({ success: true });
}

// GET: Fetch all active/non-archived entities from Supabase
export async function GET(request: Request) {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const { searchParams } = new URL(request.url);
    const checkUsage = searchParams.get('check_usage') === 'true';

    const data = await fetchAllPages((offset, limit, withCount) =>
      supabase
        .from('commission_entities')
        .select('*', withCount ? { count: 'exact' } : undefined)
        .eq('client_id', clientId)
        .or('archived.is.null,archived.eq.false')
        .order('is_active', { ascending: false })
        .order('entity_name', { ascending: true })
        .range(offset, offset + limit - 1)
    );

    // Usage only needs to know whether an entity has any payment, so each entity gets a one-row lookup
    // instead of reading every payment (which timed out for clients with many payments). A lookup that
    // fails counts as used, so delete stays blocked rather than wrongly allowed.
    let entityIdsWithPayments = new Set<string>();
    if (checkUsage && data && data.length > 0) {
      const entityIds = data.map((e: any) => String(e.id)).filter(Boolean);
      const used: string[] = [];
      const LOOKUPS_AT_ONCE = 8;
      for (let start = 0; start < entityIds.length; start += LOOKUPS_AT_ONCE) {
        const batch = entityIds.slice(start, start + LOOKUPS_AT_ONCE);
        const results = await Promise.all(batch.map(async (entityId) => {
          const { data: hit, error } = await supabase
            .from('payments')
            .select('id')
            .eq('client_id', clientId)
            .eq('payee_entity_id', entityId)
            .limit(1);
          return error || (hit && hit.length > 0) ? entityId : null;
        }));
        results.forEach((entityId) => { if (entityId) used.push(entityId); });
      }
      entityIdsWithPayments = new Set(used);
    }

    const entities = (data || []).map((entity) => ({
      ...entity,
      has_payments: entityIdsWithPayments.has(String(entity.id)),
    }));

    return NextResponse.json({ success: true, entities });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}

// POST: Create or Update entity in Supabase
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { clientId, supabase, email } = await requireSessionClient();
    const body = await request.json();
    if (body.action === 'REORDER') {
      return reorderPostSplitEntities(supabase, email, clientId, body);
    }
    const entity = body.entity || body;

    // 1. Validation: Entity Name is required. ID is optional for new records.
    if (!entity || !entity.entity_name) {
      return NextResponse.json({ error: 'Entity name is required' }, { status: 400 });
    }

    const existingId = entity.id ? String(entity.id) : null;
    const isUpdate = body.action === 'CREATE' ? false : Boolean(existingId);
    const user = email || entity.updated_by || entity.created_by || 'system_admin';
    const nextName = String(entity.entity_name).trim();

    // 2. Format row payload matching schema
    const rowPayload: Record<string, any> = {
      client_id: clientId,
      entity_name: nextName,
      entity_type: String(entity.entity_type || 'BROKERAGE'),
      contact_name: entity.contact_name ? String(entity.contact_name) : null,
      contact_email: entity.contact_email ? String(entity.contact_email) : null,
      tax_id: entity.tax_id ? String(entity.tax_id) : null,
      is_active: entity.is_active !== undefined ? Boolean(entity.is_active) : true,
      archived: Boolean(entity.archived),
      created_by: entity.created_by || user,
      updated_at: new Date().toISOString(),
      updated_by: String(user),
    };

    // New rows omit id so Postgres assigns generate_prefixed_id('ENT').
    if (isUpdate) {
      rowPayload.id = existingId;
    }

    // Commission Plans pay entities by name: a rename carries into their lines, and archiving one they use waits.
    let previousName = '';
    if (isUpdate) {
      const { data: previous, error: previousError } = await supabase
        .from('commission_entities')
        .select('entity_name')
        .eq('id', existingId)
        .eq('client_id', clientId)
        .maybeSingle();
      if (previousError) throw previousError;
      previousName = String(previous?.entity_name || '');
      if (rowPayload.archived) {
        const planUses = await planUsesOfEntity(supabase, clientId, { id: String(existingId), name: previousName || nextName });
        if (planUses.length) {
          return NextResponse.json({ error: inUseByPlansMessage(previousName || nextName, planUses) }, { status: 409 });
        }
      }
    }

    // 3. Insert or Upsert
    let query;
    if (isUpdate) {
      query = supabase
        .from('commission_entities')
        .upsert(rowPayload, { onConflict: 'id' })
        .select();
    } else {
      // Insert new entity (Postgres will execute generate_prefixed_id('ENT'))
      query = supabase
        .from('commission_entities')
        .insert(rowPayload)
        .select();
    }

    const { data, error } = await query;
    if (error) throw error;

    const returnedRow = data ? data[0] : rowPayload;
    if (isUpdate && previousName) await renameEntityInPlans(supabase, clientId, previousName, nextName);

    return NextResponse.json({
      success: true,
      message: `Entity ${isUpdate ? 'updated' : 'created'} successfully`,
      entity: returnedRow,
    });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}

// DELETE: Archive an entity record in Supabase
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Entity ID is required' }, { status: 400 });
    }

    const { clientId, supabase } = await requireSessionClient();
    const { data: entityRow, error: entityError } = await supabase
      .from('commission_entities')
      .select('entity_name')
      .eq('id', id)
      .eq('client_id', clientId)
      .maybeSingle();
    if (entityError) throw entityError;
    if (entityRow) {
      const planUses = await planUsesOfEntity(supabase, clientId, { id, name: String(entityRow.entity_name || '') });
      if (planUses.length) {
        return NextResponse.json({ error: inUseByPlansMessage(String(entityRow.entity_name || 'This entity'), planUses) }, { status: 409 });
      }
    }
    const { count, error: paymentsError } = await supabase
      .from('payments')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('payee_entity_id', id);

    if (paymentsError) throw paymentsError;
    if ((count || 0) > 0) {
      return NextResponse.json(
        { error: 'Cannot delete this commission entity because payments are mapped to it. Set it to Inactive instead.' },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from('commission_entities')
      .update({
        archived: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('client_id', clientId);

    if (error) throw error;

    return NextResponse.json({ success: true, message: 'Entity archived successfully' });
  } catch (error: any) {
    return apiError(error, 'The request could not be completed.');
  }
}
