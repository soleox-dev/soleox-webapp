import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { validateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';
import {
  parseTransactionDefaultView,
  transactionDefaultViewFromSettings,
  type TransactionSortRule,
} from '@/lib/transaction-default-view';

function clientIdFrom(request: Request, body?: { clientId?: string }) {
  return String(body?.clientId || request.headers.get('x-client-id') || request.headers.get('client_id') || 'DEMO').trim() || 'DEMO';
}

export async function GET(request: Request) {
  try {
    const clientId = clientIdFrom(request);
    const supabase = await getAuthenticatedSupabase();
    const { data, error } = await supabase
      .from('clients')
      .select('settings_json')
      .eq('id', clientId)
      .maybeSingle();
    if (error) throw error;

    const view = transactionDefaultViewFromSettings(data?.settings_json, clientId);
    const stored = data?.settings_json && typeof data.settings_json === 'object' && !Array.isArray(data.settings_json)
      ? parseTransactionDefaultView((data.settings_json as Record<string, unknown>).transaction_default_view)
      : null;

    return NextResponse.json({
      success: true,
      clientId,
      stored: Boolean(stored),
      filterFormula: view.filterFormula,
      sortRules: view.sortRules,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load the default view.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const clientId = clientIdFrom(request, body);
    const filterFormula = String(body.filterFormula ?? body.filter_formula ?? '');
    const rawRules = Array.isArray(body.sortRules) ? body.sortRules : Array.isArray(body.sort_rules) ? body.sort_rules : null;
    if (!rawRules) {
      return NextResponse.json({ success: false, error: 'Sort rules are required.' }, { status: 400 });
    }

    const sortRules: TransactionSortRule[] = [];
    for (const rule of rawRules) {
      const fieldKey = String(rule?.fieldKey || rule?.field_key || '').trim();
      const direction = rule?.direction === 'desc' ? 'desc' : rule?.direction === 'asc' ? 'asc' : null;
      if (!fieldKey || !direction) {
        return NextResponse.json({ success: false, error: 'Each sort rule needs a column and a direction.' }, { status: 400 });
      }
      sortRules.push({ fieldKey, direction });
    }

    const supabase = await getAuthenticatedSupabase();
    const { data: fields, error: fieldsError } = await supabase
      .from('client_field_configurations')
      .select('field_key')
      .eq('client_id', clientId)
      .eq('target_table', 'transactions');
    if (fieldsError) throw fieldsError;

    const knownNames = new Set<string>(['transaction_status', 'finance_status', 'closing_date', 'status']);
    (fields || []).forEach((field) => {
      if (field.field_key) knownNames.add(String(field.field_key));
    });
    const formulaError = validateFormula(filterFormula, [...knownNames]);
    if (formulaError) {
      return NextResponse.json({ success: false, error: formulaError }, { status: 400 });
    }

    const { data: client, error: readError } = await supabase
      .from('clients')
      .select('settings_json')
      .eq('id', clientId)
      .maybeSingle();
    if (readError) throw readError;

    const current = client?.settings_json && typeof client.settings_json === 'object' && !Array.isArray(client.settings_json)
      ? { ...(client.settings_json as Record<string, unknown>) }
      : {};
    const settingsJson = {
      ...current,
      transaction_default_view: {
        filter_formula: filterFormula,
        sort_rules: sortRules.map((rule) => ({ field_key: rule.fieldKey, direction: rule.direction })),
      },
    };

    const { error: saveError } = await supabase
      .from('clients')
      .update({
        settings_json: settingsJson,
        updated_at: new Date().toISOString(),
        updated_by: session.user.email,
      })
      .eq('id', clientId);
    if (saveError) throw saveError;

    return NextResponse.json({
      success: true,
      clientId,
      stored: true,
      filterFormula,
      sortRules,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save the default view.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
