'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { OptionMenu } from '@/components/ui/option-menu';
import { FieldChevron, UnderlineField, underlineControl } from '@/components/ui/underline-field';
import { isHiddenRecordId } from '@/lib/fields';
import type { FormulaName } from './commission-templates/FormulaEditor';

export const ALLOCATION_CLIENT_ID = 'DEMO';

export type AllocationAgent = { id: string; name: string };

export type AllocationSchemaField = {
  field_key: string;
  field_label?: string;
  field_type?: string;
  is_enabled?: boolean;
};

export function AllocationFieldMenu({
  label,
  value,
  placeholder,
  options,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  return (
    <UnderlineField label={label}>
      <OptionMenu
        className={`${underlineControl} overview-field-select`}
        value={value}
        placeholder={placeholder}
        options={options}
        onChange={onChange}
      />
      <FieldChevron />
    </UnderlineField>
  );
}

export function useAllocationSchema() {
  const [fields, setFields] = useState<AllocationSchemaField[]>([]);
  const [agentFields, setAgentFields] = useState<AllocationSchemaField[]>([]);
  const [agents, setAgents] = useState<AllocationAgent[]>([]);

  useEffect(() => {
    let cancelled = false;
    const headers = { 'x-client-id': ALLOCATION_CLIENT_ID };
    void (async () => {
      const [schemaResponse, agentSchemaResponse, agentsResponse] = await Promise.all([
        fetch('/api/schema/transactions', { headers }),
        fetch('/api/schema/agents', { headers }),
        fetch('/api/agents', { headers }),
      ]);
      const schemaData = await schemaResponse.json().catch(() => ({}));
      const agentSchemaData = await agentSchemaResponse.json().catch(() => ({}));
      const agentsData = await agentsResponse.json().catch(() => ({}));
      if (cancelled) return;
      const catalog: AllocationSchemaField[] = schemaData.catalog || schemaData.fields || schemaData.data || [];
      const agentCatalog: AllocationSchemaField[] = agentSchemaData.catalog || [];
      const roster: { id?: string; agent_name?: string; name?: string }[] = Array.isArray(agentsData.agents) ? agentsData.agents : [];
      setFields(catalog.filter((field) => field.is_enabled !== false && field.field_key));
      setAgentFields(agentCatalog.filter((field) => field.is_enabled !== false && field.field_key && !isHiddenRecordId('agents', field.field_key)));
      setAgents(roster.flatMap((agent) => {
        const id = String(agent.id || '');
        if (!id) return [];
        return [{ id, name: String(agent.agent_name || agent.name || id) }];
      }));
    })();
    return () => { cancelled = true; };
  }, []);

  const formulaNames = useMemo<FormulaName[]>(() => {
    const names = new Map<string, FormulaName>();
    fields.forEach((field) => {
      names.set(field.field_key, { name: field.field_key, label: field.field_label || field.field_key, kind: 'field' });
    });
    if (!names.has('transaction_status')) names.set('transaction_status', { name: 'transaction_status', label: 'Status', kind: 'field' });
    if (!names.has('finance_status')) names.set('finance_status', { name: 'finance_status', label: 'Finance Status', kind: 'field' });
    if (!names.has('acceptance_date')) names.set('acceptance_date', { name: 'acceptance_date', label: 'Acceptance Date', kind: 'field' });
    if (!names.has('closing_date')) names.set('closing_date', { name: 'closing_date', label: 'Closing Date', kind: 'field' });
    names.set('status', { name: 'status', label: 'Status', kind: 'field' });
    return Array.from(names.values());
  }, [fields]);

  return { fields, agentFields, agents, formulaNames };
}

export const allocationFormulaHint = 'Leave this blank to include every deal. lead_source="Agent Lead" keeps Agent Lead deals.';

export function fieldOptions(fields: AllocationSchemaField[], types: Set<string>, selectedKey: string) {
  const options = fields.filter((field) => types.has(field.field_type || ''));
  if (selectedKey && !options.some((field) => field.field_key === selectedKey)) {
    return [{ field_key: selectedKey, field_label: selectedKey }, ...options];
  }
  return options;
}
