/** Tables a formula may search. Each one stores client_id, and lookups never include another client's rows. */
export const FORMULA_LOOKUP_TABLES = [
  'agents',
  'client_field_configurations',
  'client_lookup_values',
  'client_user_roles',
  'commission_entities',
  'commission_template_rules',
  'commission_template_parameters',
  'commission_template_submissions',
  'commission_templates',
  'payments',
  'transaction_commission_items',
  'transactions',
] as const;

export type FormulaLookupTable = (typeof FORMULA_LOOKUP_TABLES)[number];

/** Older formulas still name the rules table commission_template_logic. */
const FORMULA_LOOKUP_ALIASES: Record<string, FormulaLookupTable> = {
  commission_template_logic: 'commission_template_rules',
};

export function formulaLookupSource(table: string): FormulaLookupTable | null {
  if ((FORMULA_LOOKUP_TABLES as readonly string[]).includes(table)) return table as FormulaLookupTable;
  return FORMULA_LOOKUP_ALIASES[table] || null;
}

export function isFormulaLookupTable(value: string): value is FormulaLookupTable {
  return (FORMULA_LOOKUP_TABLES as readonly string[]).includes(value);
}
