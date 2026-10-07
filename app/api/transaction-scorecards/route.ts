import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { validateFormula } from '@/app/(dashboard)/commission-tracker/settings/commission-templates/formula-validator';
import {
  SCORECARD_COLORS,
  parseTransactionScorecards,
  transactionScorecardsFromSettings,
  type ScorecardColor,
  type ScorecardMetric,
  type ScorecardMetricKind,
  type TransactionScorecard,
} from '@/lib/transaction-scorecards';

function clientIdFrom(request: Request, body?: { clientId?: string }) {
  return String(body?.clientId || request.headers.get('x-client-id') || request.headers.get('client_id') || 'DEMO').trim() || 'DEMO';
}

function isColor(value: string): value is ScorecardColor {
  return (SCORECARD_COLORS as readonly string[]).includes(value);
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

    const { scorecards, stored } = transactionScorecardsFromSettings(data?.settings_json, clientId);
    return NextResponse.json({ success: true, clientId, stored, scorecards });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to load scorecards.';
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
    const rawCards = Array.isArray(body.scorecards) ? body.scorecards : null;
    if (!rawCards) {
      return NextResponse.json({ success: false, error: 'Scorecards are required.' }, { status: 400 });
    }

    const supabase = await getAuthenticatedSupabase();
    const { data: fields, error: fieldsError } = await supabase
      .from('client_field_configurations')
      .select('field_key, field_type')
      .eq('client_id', clientId)
      .eq('target_table', 'transactions');
    if (fieldsError) throw fieldsError;

    const knownNames = new Set<string>(['transaction_status', 'finance_status', 'closing_date', 'acceptance_date', 'list_date', 'status']);
    const numericFields = new Set<string>();
    (fields || []).forEach((field) => {
      if (!field.field_key) return;
      knownNames.add(String(field.field_key));
      if (field.field_type === 'NUMBER' || field.field_type === 'CURRENCY' || field.field_type === 'PERCENT') {
        numericFields.add(String(field.field_key));
      }
    });

    const scorecards: TransactionScorecard[] = [];
    const seenIds = new Set<string>();
    for (const raw of rawCards) {
      const id = String(raw?.id || '').trim();
      const name = String(raw?.name || '').trim();
      const color = String(raw?.color || '').trim();
      const filterFormula = String(raw?.filterFormula ?? raw?.filter_formula ?? '');
      const rawMetrics = Array.isArray(raw?.metrics) ? raw.metrics : null;
      if (!id || seenIds.has(id)) {
        return NextResponse.json({ success: false, error: 'Each scorecard needs its own id.' }, { status: 400 });
      }
      if (!name) {
        return NextResponse.json({ success: false, error: 'Each scorecard needs a name.' }, { status: 400 });
      }
      if (!isColor(color)) {
        return NextResponse.json({ success: false, error: 'Choose a scorecard color.' }, { status: 400 });
      }
      if (!rawMetrics || rawMetrics.length < 1 || rawMetrics.length > 2) {
        return NextResponse.json({ success: false, error: `${name} needs one or two metrics.` }, { status: 400 });
      }
      const formulaError = validateFormula(filterFormula, [...knownNames]);
      if (formulaError) {
        return NextResponse.json({ success: false, error: `${name}: ${formulaError}` }, { status: 400 });
      }

      const metrics: ScorecardMetric[] = [];
      for (const rawMetric of rawMetrics) {
        const metricName = String(rawMetric?.name || '').trim();
        const kind = rawMetric?.kind === 'sum' || rawMetric?.kind === 'average' || rawMetric?.kind === 'count'
          ? rawMetric.kind as ScorecardMetricKind
          : null;
        const fieldKey = String(rawMetric?.fieldKey || rawMetric?.field_key || '').trim();
        if (!metricName || !kind) {
          return NextResponse.json({ success: false, error: `${name} has a metric that needs a name and a calculation.` }, { status: 400 });
        }
        if (kind !== 'count' && !numericFields.has(fieldKey)) {
          return NextResponse.json({ success: false, error: `${name}: choose a number, currency, or percent field for ${metricName}.` }, { status: 400 });
        }
        metrics.push(kind === 'count' ? { name: metricName, kind } : { name: metricName, kind, fieldKey });
      }

      seenIds.add(id);
      scorecards.push({ id, name, color, filterFormula, metrics });
    }

    const parsed = parseTransactionScorecards(scorecards);
    if (!parsed || parsed.length !== scorecards.length) {
      return NextResponse.json({ success: false, error: 'Scorecards could not be saved.' }, { status: 400 });
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
      transaction_scorecards: scorecards.map((card) => ({
        id: card.id,
        name: card.name,
        color: card.color,
        filter_formula: card.filterFormula,
        metrics: card.metrics.map((metric) => (
          metric.kind === 'count'
            ? { name: metric.name, kind: metric.kind }
            : { name: metric.name, kind: metric.kind, field_key: metric.fieldKey }
        )),
      })),
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

    return NextResponse.json({ success: true, clientId, stored: true, scorecards });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save scorecards.';
    const status = message.includes('Unauthorized') ? 401 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
