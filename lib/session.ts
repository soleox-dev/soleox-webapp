// lib/session.ts

import { getAuthenticatedSupabase } from '@/lib/supabase';
import { SupabaseClient } from '@supabase/supabase-js';

export interface TenantContext {
  clientId: string;
  clientName: string;
  clientType: 'BROKERAGE' | 'TEAM' | 'SOLO_AGENT';
  trackDetailedPayments: boolean;
  requireComplianceApproval: boolean;
  defaultFinancialVisibility: string;
}

export class TenantAccessError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'TenantAccessError';
    this.status = status;
  }
}

export function responseStatus(error: unknown): number {
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status?: unknown }).status;
    if (typeof status === 'number') return status;
  }
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('Unauthorized')) return 401;
  return 500;
}

function requestedId(value?: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed || null;
}

/**
 * Resolves the brokerage for this request from the signed-in user's memberships.
 * A requested client id is accepted only when the user belongs to it.
 */
export async function getTenantContext(
  clientIdHeader?: string | null,
  client?: SupabaseClient
): Promise<TenantContext> {
  const sb = client || (await getAuthenticatedSupabase());
  const requested = requestedId(clientIdHeader);

  const { data: memberships, error: membershipError } = await sb
    .from('client_user_roles')
    .select('client_id, is_primary_team')
    .eq('is_active', true);

  if (membershipError) {
    throw new TenantAccessError(membershipError.message, 500);
  }

  const clientIds = [...new Set((memberships || []).map((row) => String(row.client_id)).filter(Boolean))];

  let activeClientId: string;
  if (requested) {
    if (!clientIds.includes(requested)) {
      throw new TenantAccessError('You do not have access to this brokerage.', 403);
    }
    activeClientId = requested;
  } else if (clientIds.length === 1) {
    activeClientId = clientIds[0];
  } else if (clientIds.length === 0) {
    throw new TenantAccessError('Unauthorized: No brokerage is assigned to this account.', 403);
  } else {
    const primaryIds = [...new Set(
      (memberships || [])
        .filter((row) => row.is_primary_team)
        .map((row) => String(row.client_id))
        .filter(Boolean)
    )];
    if (primaryIds.length === 1) {
      activeClientId = primaryIds[0];
    } else {
      throw new TenantAccessError('This account belongs to more than one brokerage. Choose one before continuing.', 409);
    }
  }

  const { data, error } = await sb
    .from('clients')
    .select(
      'id, client_name, client_type, track_detailed_payments, require_compliance_approval, default_financial_visibility'
    )
    .eq('id', activeClientId)
    .eq('status', 'ACTIVE')
    .single();

  if (error || !data) {
    throw new TenantAccessError('Unauthorized: Active brokerage was not found for this account.', 403);
  }

  return {
    clientId: data.id,
    clientName: data.client_name,
    clientType: data.client_type as TenantContext['clientType'],
    trackDetailedPayments: Boolean(data.track_detailed_payments),
    requireComplianceApproval: Boolean(data.require_compliance_approval),
    defaultFinancialVisibility: data.default_financial_visibility || 'FULL',
  };
}

/** Reads an explicit client id from the body, header, or query, then checks membership. */
export async function resolveRequestTenant(
  request: Request,
  bodyClientId?: string | null,
): Promise<{ supabase: SupabaseClient; tenant: TenantContext }> {
  const supabase = await getAuthenticatedSupabase();
  const url = new URL(request.url);
  const requested =
    requestedId(bodyClientId)
    || requestedId(request.headers.get('x-client-id'))
    || requestedId(request.headers.get('client_id'))
    || requestedId(url.searchParams.get('client_id'))
    || requestedId(url.searchParams.get('clientId'));

  const tenant = await getTenantContext(requested, supabase);
  return { supabase, tenant };
}
