// app/api/schema/[table]/route.ts

import { NextResponse } from 'next/server';
import { getAuthenticatedSupabase } from '@/lib/supabase';
import { getTenantContext } from '@/lib/session';
import {
  getDbTableColumns,
  HIDDEN_CONTAINER_KEYS,
  DatabaseColumnDefinition,
  schemaCache,
} from '@/lib/fields';

const CACHE_TTL_MS = 10 * 1000;

const DEFAULT_AGENT_STATUS_OPTIONS = ['Active', 'Released'];

const BASE_TRANSACTION_SYSTEM_FIELDS = [
  { field_key: 'id', field_label: 'Transaction ID', field_type: 'TEXT', section_name: 'Deal Essentials', is_system: true, is_enabled: true },
  { field_key: 'transaction_status', field_label: 'Status', field_type: 'SELECT', section_name: 'Deal Essentials', is_system: true, is_enabled: true },
  { field_key: 'agent_id', field_label: 'Primary Agent', field_type: 'AGENT_PICKER', section_name: 'Deal Essentials', is_system: true, is_enabled: true },
  { field_key: 'transaction_side', field_label: 'Side', field_type: 'SELECT', section_name: 'Deal Essentials', is_system: true, is_enabled: true },
  { field_key: 'property_address', field_label: 'Property Address', field_type: 'TEXT', section_name: 'Deal Essentials', is_system: true, is_enabled: true },
  { field_key: 'sales_price', field_label: 'Sales Price', field_type: 'CURRENCY', section_name: 'System', is_system: true, is_enabled: true },
  { field_key: 'gci_type', field_label: 'GCI Type', field_type: 'SELECT', section_name: 'System', is_system: true, is_enabled: true },
  { field_key: 'gci_perc', field_label: 'GCI %', field_type: 'PERCENT', section_name: 'System', is_system: true, is_enabled: true },
  { field_key: 'gci_amount', field_label: 'GCI Amount', field_type: 'CURRENCY', section_name: 'System', is_system: true, is_enabled: true },
  { field_key: 'total_commission', field_label: 'Total Commission', field_type: 'CURRENCY', section_name: 'System', is_system: true, is_enabled: true },
];

export async function GET(
  request: Request,
  { params }: { params: Promise<{ table: string }> }
) {
  const { table } = await params;

  if (table !== 'transactions' && table !== 'agents') {
    return NextResponse.json({ error: 'Invalid target table' }, { status: 400 });
  }

  try {
    const supabase = await getAuthenticatedSupabase();

    // 1. Resolve active tenant context dynamically
    const headerClientId = request.headers.get('x-client-id') || request.headers.get('client_id');
    const tenant = await getTenantContext(headerClientId, supabase);
    const clientId = tenant.clientId;

    const cacheKey = `${clientId}_${table}`;
    const cached = schemaCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({
        catalog: cached.catalog,
        db_columns: cached.db_columns,
        source: 'cache',
      });
    }

    // 2. Fetch saved field configurations and lookup dropdown options from Supabase
    const [savedConfigRes, lookupsRes] = await Promise.all([
      supabase
        .from('client_field_configurations')
        .select('*')
        .eq('client_id', clientId)
        .eq('target_table', table)
        .or('archived.is.null,archived.eq.false')
        .order('section_sort_order', { ascending: true })
        .order('sort_order', { ascending: true }),

      supabase
        .from('client_lookup_values')
        .select('category, option_label, option_value, sort_order')
        .eq('client_id', clientId)
        .eq('is_active', true)
        .or('archived.is.null,archived.eq.false')
        .order('category', { ascending: true })
        .order('sort_order', { ascending: true }),
    ]);

    if (savedConfigRes.error) throw savedConfigRes.error;
    if (lookupsRes.error) throw lookupsRes.error;

    const savedConfigs = savedConfigRes.data || [];
    const lookups = lookupsRes.data || [];

    const getDropdownOptions = (fieldKey: string) => {
      const matched = lookups
        .filter((lk: any) => lk.category.toUpperCase() === fieldKey.toUpperCase())
        .map((lk: any) => lk.option_label);
      return matched.length > 0 ? matched : undefined;
    };

    // 3. Build physical database table columns catalog
    const baseDbColumns: DatabaseColumnDefinition[] = getDbTableColumns(table);

    // Dynamically discover any additional physical columns that may exist on the table in Postgres
    try {
      const { data: sampleRow } = await supabase
        .from(table)
        .select('*')
        .limit(1);

      if (sampleRow && sampleRow[0]) {
        const existingKeys = new Set(baseDbColumns.map((c) => c.field_key));
        Object.keys(sampleRow[0]).forEach((k) => {
          if (!HIDDEN_CONTAINER_KEYS.has(k) && !existingKeys.has(k)) {
            baseDbColumns.push({
              field_key: k,
              field_label: k.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
              field_type: 'TEXT',
              section_name: table === 'agents' ? 'Identity & Status' : 'Deal Essentials',
              storage_type: 'CORE_COLUMN',
              is_system: false,
              is_required: false,
              is_enabled: true,
            });
          }
        });
      }
    } catch (e) {
      // Continue with base column definitions
    }

    // Attach dynamic dropdown options to database columns
    const dbColumns = baseDbColumns.map((col) => {
      let dropdownOptions = col.dropdown_options;
      if (col.field_type === 'SELECT') {
        const matched = getDropdownOptions(col.field_key);
        if (matched) dropdownOptions = matched;
        else if (col.field_key === 'agent_status') dropdownOptions = DEFAULT_AGENT_STATUS_OPTIONS;
      }

      return {
        ...col,
        dropdown_options: dropdownOptions,
      };
    });

    // 4. Build saved / active configured fields catalog
    let catalog: Record<string, any>[] = [];

    if (savedConfigs.length > 0) {
      catalog = savedConfigs.map((cfg: any) => {
        let dropdownOptions = cfg.dropdown_options;
        if (cfg.field_type === 'SELECT') {
          const matchedOptions = getDropdownOptions(cfg.field_key);
          if (matchedOptions) dropdownOptions = matchedOptions;
        }

        return {
          id: cfg.id,
          client_id: cfg.client_id,
          target_table: cfg.target_table,
          field_key: cfg.field_key,
          storage_type: cfg.storage_type,
          section_name: cfg.section_name,
          section_sort_order: cfg.section_sort_order,
          sort_order: cfg.sort_order,
          field_label: cfg.field_label || cfg.field_key,
          field_type: cfg.field_type,
          is_required: Boolean(cfg.is_required),
          is_system: Boolean(cfg.is_system),
          is_enabled: Boolean(cfg.is_enabled),
          dropdown_options: dropdownOptions,
          min_value: cfg.min_value,
          max_value: cfg.max_value,
          min_date: cfg.min_date,
          max_length: cfg.max_length,
          visibility_rules: cfg.visibility_rules
            ? typeof cfg.visibility_rules === 'string'
              ? JSON.parse(cfg.visibility_rules)
              : cfg.visibility_rules
            : undefined,
          calculation_formula: cfg.calculation_formula || undefined,
          regex_pattern: cfg.regex_pattern,
          regex_mode: cfg.regex_mode,
        };
      });

      // Guarantee mandatory transaction system fields are present and enabled
      if (table === 'transactions') {
        BASE_TRANSACTION_SYSTEM_FIELDS.forEach((sysField) => {
          const existingIndex = catalog.findIndex((c: any) => c.field_key === sysField.field_key);

          if (existingIndex === -1) {
            catalog.push({
              ...sysField,
              is_required: true,
              dropdown_options: sysField.field_type === 'SELECT' ? getDropdownOptions(sysField.field_key) : undefined,
            });
          } else {
            catalog[existingIndex].is_system = true;
            catalog[existingIndex].is_enabled = true;
            catalog[existingIndex].is_required = true;
            if (catalog[existingIndex].field_key === 'agent_id') {
              catalog[existingIndex].field_type = 'AGENT_PICKER';
              catalog[existingIndex].field_label = 'Primary Agent';
              catalog[existingIndex].calculation_formula = undefined;
            }
            if (catalog[existingIndex].field_key === 'gci_perc') {
              catalog[existingIndex].field_type = 'PERCENT';
            }
          }
        });
      }
    } else {
      // Fallback if no saved configs exist yet
      catalog = dbColumns.map((col, idx) => ({
        ...col,
        id: `SYS_${col.field_key}`,
        client_id: clientId,
        target_table: table,
        section_sort_order: 1,
        sort_order: idx + 1,
      }));
    }

    schemaCache.set(cacheKey, { catalog, db_columns: dbColumns, timestamp: Date.now() });

    return NextResponse.json({
      catalog,
      db_columns: dbColumns,
      source: savedConfigs.length > 0 ? 'saved_configs' : 'default_schema',
    });
  } catch (error: any) {
    console.error(`❌ Schema fetch failed for table "${table}":`, error.message);
    return NextResponse.json(
      { catalog: [], db_columns: [], error: `Failed to load dynamic schema for ${table}: ${error.message}` },
      { status: 500 }
    );
  }
}
