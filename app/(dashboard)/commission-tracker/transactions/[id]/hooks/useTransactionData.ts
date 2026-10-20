// app/commission-tracker/transactions/[id]/hooks/useTransactionData.ts
import { useState, useEffect, useCallback } from 'react';
import { FieldSetting, SchemaField, CORE_REQUIRED_FIELDS, VisibilityRulesConfig, KnownAgentInfo, CommissionEntityOption } from '../types';
import { StoredCommissionItem } from '../commissionItemState';
import { clearCommissionModuleCache } from '../components/applyTemplateLogic';

const AGENT_DIRECTORY_KEYS = new Set([
  'id',
  'agent_id',
  'client_id',
  'user_id',
  'tms_id',
  'agent_name',
  'name',
  'full_name',
  'agent_email',
  'email',
  'agent_phone',
  'phone',
  'group_id',
  'agent_status',
  'is_team_lead',
  'isTeamLead',
  'agent_onboard_date',
  'agent_offboard_date',
  'custom_attributes',
  'commission_attributes',
  'archived',
  'created_at',
  'created_by',
  'updated_at',
  'updated_by',
]);

function agentFormulaFields(agent: Record<string, unknown>): Record<string, string> {
  const source: Record<string, unknown> = { ...agent };
  const custom = source.custom_attributes;
  if (typeof custom === 'string') {
    try {
      const parsed = JSON.parse(custom) as unknown;
      if (parsed && typeof parsed === 'object') Object.assign(source, parsed);
    } catch {
      // Ignore invalid JSON string
    }
  } else if (custom && typeof custom === 'object') {
    Object.assign(source, custom);
  }

  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (AGENT_DIRECTORY_KEYS.has(key) || value === null || value === undefined || value === '') continue;
    if (typeof value === 'object') continue;
    fields[key] = String(value);
  }
  return fields;
}

/**
 * What the last Transaction Detail page loaded. Moving to another transaction rebuilds the page,
 * so the next one starts from these and refreshes them, instead of waiting on every list again.
 * The Transactions list fills the deals when it loads them.
 */
const session: {
  deals?: any[];
  overviewFields?: FieldSetting[];
  agents?: KnownAgentInfo[];
  entities?: CommissionEntityOption[];
} = {};

export function rememberTransactions(deals: any[]): void {
  session.deals = deals;
}

export function useTransactionData(routeId: string, isNewTransaction: boolean) {
  const [savedDeals, setSavedDeals] = useState<any[]>(() => session.deals ?? []);
  const [overviewFields, setOverviewFields] = useState<FieldSetting[]>(() => session.overviewFields ?? []);
  const [knownAgents, setKnownAgents] = useState<KnownAgentInfo[]>(() => session.agents ?? []);
  const [knownEntities, setKnownEntities] = useState<CommissionEntityOption[]>(() => session.entities ?? []);
  const [isLoadingDeals, setIsLoadingDeals] = useState<boolean>(() => !session.deals);
  // The commission replay maps ledger lines to entity names, so it waits for this list.
  const [entitiesLoaded, setEntitiesLoaded] = useState<boolean>(() => Boolean(session.entities));

  // Keep the session copy current, including saves and edits made on this page.
  useEffect(() => {
    if (savedDeals.length > 0) session.deals = savedDeals;
  }, [savedDeals]);
  useEffect(() => {
    if (overviewFields.length > 0) session.overviewFields = overviewFields;
  }, [overviewFields]);
  useEffect(() => {
    if (knownAgents.length > 0) session.agents = knownAgents;
  }, [knownAgents]);
  useEffect(() => {
    if (knownEntities.length > 0) session.entities = knownEntities;
  }, [knownEntities]);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [commissionItems, setCommissionItems] = useState<StoredCommissionItem[]>([]);
  const [commissionItemsDealId, setCommissionItemsDealId] = useState<string | null>(null);

  useEffect(() => {
    async function loadSchema() {
      try {
        const res = await fetch('/api/schema/transactions');
        if (!res.ok) throw new Error(`Schema API returned ${res.status}`);

        const data = await res.json();
        console.log('--- STEP 1: RAW API RESPONSE ---', data);

        const rawCatalog: SchemaField[] = data.catalog || data.fields || data.data || [];
        console.log('--- STEP 1: FIRST CATALOG ITEM ---', rawCatalog[0]);

        if (!Array.isArray(rawCatalog) || rawCatalog.length === 0) {
          setOverviewFields([]);
          return;
        }

        const mappedFields: FieldSetting[] = rawCatalog
          .filter((f: any) => f.is_enabled !== false)
          .map((f: any, idx) => {
            let rawRules = f.visibility_rules || null;
            if (typeof rawRules === 'string') {
              try { rawRules = JSON.parse(rawRules); } catch (e) { rawRules = null; }
            }

            let normalizedConfig: VisibilityRulesConfig = { operator: 'OR', conditions: [] };
            if (rawRules && typeof rawRules === 'object') {
              if (Array.isArray(rawRules)) normalizedConfig.conditions = rawRules;
              else if (Array.isArray(rawRules.conditions)) normalizedConfig = { operator: rawRules.operator || 'OR', conditions: rawRules.conditions };
            }

            // Preserves explicit section definitions from DB catalog
            const rawSection = f.section_name || f.section || f.section_title || f.group_name || f.group || 'General Info';

            return {
              id: f.id || `schema_${idx}`,
              label: f.field_label || f.field_key,
              key: f.field_key,
              type: f.field_type || 'TEXT',
              section: rawSection,
              storage_type: f.storage_type || 'CUSTOM_JSON',
              is_required: Boolean(f.is_required) || CORE_REQUIRED_FIELDS.has(f.field_key),
              options: f.dropdown_options || f.options || [],
              visibility_rules: normalizedConfig,
              calculation_formula: f.calculation_formula && f.calculation_formula.trim().length > 0 ? f.calculation_formula.trim() : undefined,
            };
          });

        setOverviewFields(mappedFields);
      } catch (err) {
        console.error('Error loading dynamic schema:', err);
        setOverviewFields([]);
      }
    }
    loadSchema();
  }, []);

  useEffect(() => {
    async function loadDealsAndAgents() {
      try {
        if (!session.deals) setIsLoadingDeals(true);
        // Each list is used as soon as it arrives. The whole deals list is the slowest, and the
        // commission numbers need only the agents and entities.
        const loadDeals = fetch('/api/transactions').then(async (dealsRes) => {
          if (dealsRes.ok && dealsRes.headers.get('content-type')?.includes('application/json')) {
            const dealsData = await dealsRes.json();
            setSavedDeals(dealsData.transactions || dealsData.deals || []);
          }
        });
        const loadAgents = fetch('/api/agents?include_archived=true').then(async (agentsRes) => {
          if (agentsRes.ok && agentsRes.headers.get('content-type')?.includes('application/json')) {
            const agentsData = await agentsRes.json();
            if (agentsData.success && agentsData.agents) {
              setKnownAgents(
                agentsData.agents.map((ag: any) => ({
                  id: ag.id || `AGT_${ag.agent_name}`,
                  name: ag.agent_name || ag.name || ag.full_name || 'Unnamed Agent',
                  email: ag.agent_email || ag.email,
                  isTeamLead: Boolean(ag.is_team_lead || ag.isTeamLead),
                  clientId: ag.client_id ? String(ag.client_id) : undefined,
                  fields: agentFormulaFields(ag),
                }))
              );
            }
          }
        });
        const loadEntities = fetch('/api/commission-entities').then(async (entitiesRes) => {
          if (entitiesRes.ok && entitiesRes.headers.get('content-type')?.includes('application/json')) {
            const entitiesData = await entitiesRes.json();
            if (entitiesData.success && entitiesData.entities) {
              setKnownEntities(
                entitiesData.entities.map((e: any) => ({
                  id: e.id,
                  name: e.entity_name || e.name || 'Unnamed Entity',
                  type: e.entity_type || e.type,
                  waterfallSortOrder: e.waterfall_sort_order == null ? null : Number(e.waterfall_sort_order),
                }))
              );
            }
          }
        }).finally(() => setEntitiesLoaded(true));

        const results = await Promise.allSettled([loadDeals, loadAgents, loadEntities]);
        results.forEach((result) => {
          if (result.status === 'rejected') console.error('Error fetching initial data:', result.reason);
        });
      } catch (err) {
        console.error('Error fetching initial data:', err);
      } finally {
        setIsLoadingDeals(false);
      }
    }
    loadDealsAndAgents();
  }, []);

  useEffect(() => {
    if (isNewTransaction || !routeId) {
      setCommissionItems([]);
      setCommissionItemsDealId(isNewTransaction ? 'new' : null);
      return;
    }

    let cancelled = false;
    setCommissionItemsDealId(null);

    async function loadCommissionItems() {
      try {
        const res = await fetch(`/api/transactions/${encodeURIComponent(routeId)}/items`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        setCommissionItems(res.ok && data.success !== false ? (data.items || []) : []);
      } catch (err) {
        console.error('Error fetching commission items:', err);
        if (!cancelled) setCommissionItems([]);
      } finally {
        if (!cancelled) setCommissionItemsDealId(routeId);
      }
    }

    loadCommissionItems();
    return () => {
      cancelled = true;
    };
  }, [routeId, isNewTransaction]);

  const saveTransaction = async (
    payload: any,
    resolvedClientId: string,
    showToast: (msg: string, type: 'success' | 'error') => void,
    onSuccess?: (savedTxn: any, commissionItems?: StoredCommissionItem[]) => boolean | void | Promise<boolean | void>
  ) => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-client-id': resolvedClientId },
        body: JSON.stringify(payload),
      });

      const responseData = await res.json().catch(() => ({}));
      if (res.ok && responseData.success !== false) {
        clearCommissionModuleCache();
        const outcome = onSuccess && responseData.transaction
          ? await onSuccess(responseData.transaction, responseData.commissionItems)
          : undefined;
        if (outcome === false) return;
        showToast(`Transaction ${payload.id} saved successfully!`, 'success');
      } else {
        showToast(`Failed to save: ${responseData.error || responseData.message}`, 'error');
      }
    } catch (err: any) {
      showToast(`Error saving record: ${err?.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const reloadAgents = useCallback(async () => {
    try {
      const agentsRes = await fetch('/api/agents?include_archived=true');
      if (agentsRes.ok && agentsRes.headers.get('content-type')?.includes('application/json')) {
        const agentsData = await agentsRes.json();
        if (agentsData.success && agentsData.agents) {
          setKnownAgents(
            agentsData.agents.map((ag: any) => ({
              id: ag.id || `AGT_${ag.agent_name}`,
              name: ag.agent_name || ag.name || ag.full_name || 'Unnamed Agent',
              email: ag.agent_email || ag.email,
              isTeamLead: Boolean(ag.is_team_lead || ag.isTeamLead),
              clientId: ag.client_id ? String(ag.client_id) : undefined,
              fields: agentFormulaFields(ag),
            }))
          );
        }
      }
    } catch (err) {
      console.error('Error reloading agents:', err);
    }
  }, []);

  return {
    savedDeals,
    setSavedDeals,
    overviewFields,
    knownAgents,
    knownEntities,
    entitiesLoaded,
    commissionItems,
    setCommissionItems,
    commissionItemsDealId,
    setCommissionItemsDealId,
    isLoadingDeals,
    isSaving,
    saveTransaction,
    reloadAgents,
  };
}