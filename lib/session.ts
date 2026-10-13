// lib/session.ts

import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CLIENT_COOKIE, loadAccessForEmail } from '@/lib/access';
import { getAuthenticatedSupabase, supabaseAdmin } from '@/lib/supabase';
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
  _client?: SupabaseClient
): Promise<TenantContext> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new TenantAccessError('Unauthorized: No active user session', 401);

  const jar = await cookies();
  const access = await loadAccessForEmail(email, jar.get(CLIENT_COOKIE)?.value ?? requestedId(clientIdHeader));
  if (access.clients.length === 0) {
    throw new TenantAccessError('Unauthorized: No brokerage is assigned to this account.', 403);
  }
  if (!access.clientId) {
    throw new TenantAccessError('This account belongs to more than one brokerage. Choose one before continuing.', 409);
  }

  const requested = requestedId(clientIdHeader);
  if (requested && requested !== access.clientId) {
    throw new TenantAccessError('You do not have access to this brokerage.', 403);
  }
  const activeClientId = access.clientId;

  const { data, error } = await supabaseAdmin
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
