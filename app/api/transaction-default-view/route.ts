import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { requireSessionClient, apiError } from '@/lib/session';
import { validateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';
import {
  MAX_TRANSACTION_VIEWS,
  defaultTransactionView,
  transactionViewNameError,
  transactionViewsFromSettings,
  type TransactionSortRule,
  type TransactionView,
} from '@/lib/transaction-default-view';

function viewPayload(config: ReturnType<typeof transactionViewsFromSettings>) {
  const designated = defaultTransactionView(config);
  return {
    views: config.views,
    defaultViewId: config.defaultViewId,
    filterFormula: designated.filterFormula,
    sortRules: designated.sortRules,
  };
}

export async function GET(request: Request) {
  try {
    const { clientId, supabase } = await requireSessionClient();
    const { data, error } = await supabase
      .from('clients')
      .select('settings_json')
      .eq('id', clientId)
      .maybeSingle();
    if (error) throw error;

    const config = transactionViewsFromSettings(data?.settings_json, clientId);
    const stored = data?.settings_json && typeof data.settings_json === 'object' && !Array.isArray(data.settings_json)
      ? Boolean((data.settings_json as Record<string, unknown>).transaction_views)
      : false;

    return NextResponse.json({
      success: true,
      clientId,
      stored,
      ...viewPayload(config),
    });
  } catch (error: unknown) {
    return apiError(error, 'Failed to load views.', 'success');
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, supabase } = await requireSessionClient();
    const rawViews = Array.isArray(body.views) ? body.views : null;
    const defaultViewId = String(body.defaultViewId || body.default_view_id || '').trim();
    if (!rawViews) {
      return NextResponse.json({ success: false, error: 'Views are required.' }, { status: 400 });
    }
    if (rawViews.length < 1 || rawViews.length > MAX_TRANSACTION_VIEWS) {
      return NextResponse.json({ success: false, error: `Save 1 to ${MAX_TRANSACTION_VIEWS} views.` }, { status: 400 });
    }

    const views: TransactionView[] = [];
    const seenIds = new Set<string>();
    for (const raw of rawViews) {
      const id = String(raw?.id || '').trim();
      const name = String(raw?.name || '').trim().replace(/\s+/g, ' ');
      const filterFormula = String(raw?.filterFormula ?? raw?.filter_formula ?? '');
      const rawRules = Array.isArray(raw?.sortRules) ? raw.sortRules : Array.isArray(raw?.sort_rules) ? raw.sort_rules : null;
      if (!/^[A-Za-z0-9_-]{1,64}$/.test(id) || seenIds.has(id)) {
        return NextResponse.json({ success: false, error: 'Each view needs its own id.' }, { status: 400 });
      }
      const nameError = transactionViewNameError(name, views.map((view) => view.name));
      if (nameError) return NextResponse.json({ success: false, error: nameError }, { status: 400 });
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
      seenIds.add(id);
      views.push({ id, name, filterFormula, sortRules });
    }
    if (!views.some((view) => view.id === defaultViewId)) {
      return NextResponse.json({ success: false, error: 'Choose one default view.' }, { status: 400 });
    }

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
    for (const view of views) {
      const formulaError = validateFormula(view.filterFormula, [...knownNames]);
      if (formulaError) {
        return NextResponse.json({ success: false, error: `${view.name}: ${formulaError}` }, { status: 400 });
      }
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
    const designated = views.find((view) => view.id === defaultViewId) || views[0];
    const settingsJson = {
      ...current,
      transaction_views: {
        default_view_id: defaultViewId,
        views: views.map((view) => ({
          id: view.id,
          name: view.name,
          filter_formula: view.filterFormula,
          sort_rules: view.sortRules.map((rule) => ({ field_key: rule.fieldKey, direction: rule.direction })),
        })),
      },
      transaction_default_view: {
        filter_formula: designated.filterFormula,
        sort_rules: designated.sortRules.map((rule) => ({ field_key: rule.fieldKey, direction: rule.direction })),
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
      ...viewPayload({ views, defaultViewId }),
    });
  } catch (error: unknown) {
    return apiError(error, 'Failed to save views.', 'success');
  }
}
