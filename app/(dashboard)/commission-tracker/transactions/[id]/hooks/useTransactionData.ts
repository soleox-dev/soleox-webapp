// app/commission-tracker/transactions/[id]/hooks/useTransactionData.ts
import { useState, useEffect } from 'react';
import { FieldSetting, SchemaField, CORE_REQUIRED_FIELDS, VisibilityRulesConfig, KnownAgentInfo, CommissionEntityOption } from '../types';
import { StoredCommissionItem } from '../commissionItemState';

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
  const fields: Record<string, string> = {};
  for (const [key, value] of Object.entries(agent)) {
    if (AGENT_DIRECTORY_KEYS.has(key) || value === null || value === undefined || value === '') continue;
    if (typeof value === 'object') continue;
    fields[key] = String(value);
  }
  return fields;
}

export function useTransactionData(routeId: string, isNewTransaction: boolean) {
  const [savedDeals, setSavedDeals] = useState<any[]>([]);
  const [overviewFields, setOverviewFields] = useState<FieldSetting[]>([]);
  const [knownAgents, setKnownAgents] = useState<KnownAgentInfo[]>([]);
  const [knownEntities, setKnownEntities] = useState<CommissionEntityOption[]>([]);
  const [isLoadingDeals, setIsLoadingDeals] = useState<boolean>(true);
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
        setIsLoadingDeals(true);
        const [dealsRes, agentsRes, entitiesRes] = await Promise.all([
          fetch('/api/transactions'),
          fetch('/api/agents?include_archived=true'),
          fetch('/api/commission-entities'),
        ]);

        if (dealsRes.ok && dealsRes.headers.get('content-type')?.includes('application/json')) {
          const dealsData = await dealsRes.json();
          setSavedDeals(dealsData.transactions || dealsData.deals || []);
        }

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
    onSuccess?: (savedTxn: any, commissionItems?: StoredCommissionItem[]) => void
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
        showToast(`Transaction ${payload.id} saved successfully!`, 'success');
        if (onSuccess && responseData.transaction) onSuccess(responseData.transaction, responseData.commissionItems);
      } else {
        showToast(`Failed to save: ${responseData.error || responseData.message}`, 'error');
      }
    } catch (err: any) {
      showToast(`Error saving record: ${err?.message || err}`, 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return {
    savedDeals,
    setSavedDeals,
    overviewFields,
    knownAgents,
    knownEntities,
    commissionItems,
    setCommissionItems,
    commissionItemsDealId,
    setCommissionItemsDealId,
    isLoadingDeals,
    isSaving,
    saveTransaction,
  };
}