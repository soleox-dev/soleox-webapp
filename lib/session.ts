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

/**
 * Resolves active tenant context directly from Supabase using authenticated RLS context.
 */
export async function getTenantContext(
  clientIdHeader?: string | null,
  client?: SupabaseClient
): Promise<TenantContext> {
  const activeClientId = clientIdHeader || process.env.NEXT_PUBLIC_DEFAULT_CLIENT_ID || 'DEMO';
  const sb = client || (await getAuthenticatedSupabase());

  const { data, error } = await sb
    .from('clients')
    .select(
      'id, client_name, client_type, track_detailed_payments, require_compliance_approval, default_financial_visibility'
    )
    .eq('id', activeClientId)
    .eq('status', 'ACTIVE')
    .single();

  if (error || !data) {
    throw new Error(`Active client context not found in Supabase for client_id: ${activeClientId}`);
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
