// lib/session.ts

import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CLIENT_COOKIE, loadAccessForEmail } from '@/lib/access';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabase-admin';
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

/**
 * The brokerage chosen for this session. A client id on the request is ignored.
 */
export async function requireSessionClient(): Promise<{ email: string; clientId: string; supabase: SupabaseClient }> {
  const tenant = await getTenantContext();
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new TenantAccessError('Unauthorized: No active user session', 401);
  return { email, clientId: tenant.clientId, supabase: await getAuthenticatedSupabase(email) };
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message?: unknown }).message ?? '');
  }
  return '';
}

function looksLikeDatabaseDetail(error: unknown, raw: string): boolean {
  if (error && typeof error === 'object' && ('details' in error || 'hint' in error)) return true;
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String((error as { code?: unknown }).code ?? '');
    if (/^\d{5}$/.test(code) || code.startsWith('PGRST')) return true;
  }
  return /schema cache|duplicate key|violates |relation |column |syntax error|\bjwt\b|password authentication|permission denied/i.test(raw);
}

/** A safe message for the browser. Database details stay in the server log. */
export function publicError(error: unknown, fallback: string): { message: string; status: number } {
  if (error instanceof TenantAccessError) return { message: error.message, status: error.status };
  const raw = errorText(error).trim();
  if (raw.includes('Unauthorized')) return { message: 'Unauthorized', status: 401 };
  console.error(error);
  if (raw.toLowerCase().includes('not found')) return { message: 'That record was not found.', status: 404 };
  const status = responseStatus(error);
  const safeStatus = status === 400 || status === 403 || status === 409 ? status : 500;
  if (raw && raw.length <= 180 && !raw.includes('\n') && !looksLikeDatabaseDetail(error, raw)) {
    return { message: raw, status: safeStatus };
  }
  return { message: fallback, status: safeStatus };
}

export function apiError(error: unknown, fallback: string, shape: 'plain' | 'success' = 'plain') {
  const failure = publicError(error, fallback);
  const body = shape === 'success'
    ? { success: false as const, error: failure.message }
    : { error: failure.message };
  return NextResponse.json(body, { status: failure.status });
}

/**
 * Resolves the brokerage for this request from the signed-in user's chosen client.
 * A client id on the request does not select a different brokerage.
 */
export async function getTenantContext(
  _clientIdHeader?: string | null,
  _client?: SupabaseClient
): Promise<TenantContext> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) throw new TenantAccessError('Unauthorized: No active user session', 401);

  const jar = await cookies();
  const access = await loadAccessForEmail(email, jar.get(CLIENT_COOKIE)?.value ?? null);
  if (access.clients.length === 0) {
    throw new TenantAccessError('Unauthorized: No brokerage is assigned to this account.', 403);
  }
  if (!access.clientId) {
    throw new TenantAccessError('This account belongs to more than one brokerage. Choose one before continuing.', 409);
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

/** The signed-in user's chosen client. Request client ids are ignored. */
export async function resolveRequestTenant(
  _request?: Request,
  _bodyClientId?: string | null,
): Promise<{ supabase: SupabaseClient; tenant: TenantContext }> {
  const tenant = await getTenantContext();
  const supabase = await getAuthenticatedSupabase();
  return { supabase, tenant };
}
