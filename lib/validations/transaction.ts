import { z } from 'zod';

// Nullable numeric validator (No defaults, no forcing 0)
const nullableNumber = z
  .union([z.number(), z.string(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return isNaN(num) ? null : num;
  })
  .optional()
  .nullable();

// Nullable string validator (No defaults, no fallback strings)
const nullableString = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => {
    if (val === null || val === undefined) return null;
    const str = String(val).trim();
    return str.length > 0 ? str : null;
  })
  .optional()
  .nullable();

// Flexible record type helper for JSONB fields
const jsonbRecord = z.record(z.string(), z.any()).optional().nullable();

export const CreateTransactionSchema = z
  .object({
    // ==========================================
    // 1. STRICT SYSTEM IDENTIFIERS
    // ==========================================
    id: z.string().min(1, 'Transaction ID is required'),
    client_id: z.string().min(1, 'Client ID is required'),

    // ==========================================
    // 2. SYSTEM FIELDS (Accepts null/omitted when hidden, zero defaults)
    // ==========================================
    transaction_status: nullableString,
    transaction_side: nullableString,
    property_address: nullableString,
    agent_id: nullableString,
    closing_date: nullableString,

    // System Financials (Passes null directly if hidden/unassigned)
    sales_price: nullableNumber,
    gci_type: nullableString,
    gci_perc: nullableNumber,
    gci_amount: nullableNumber,
    total_commission: nullableNumber,

    // ==========================================
    // 3. COMMON OPTIONAL FIELDS (Mapped DB Columns)
    // ==========================================
    tms_id: nullableString,
    finance_status: nullableString,
    client_name: nullableString,
    lead_source: nullableString,
    lead_owner: nullableString,
    list_price: nullableNumber,
    transaction_fee: nullableNumber,
    list_date: nullableString,
    acceptance_date: nullableString,

    // Array & Structured JSONB Data Columns (Fixed z.record signatures)
    isa: z.array(z.string()).optional().nullable(),
    transaction_coordinator: z.array(z.string()).optional().nullable(),
    co_broker: jsonbRecord,
    settlement_vendors: jsonbRecord,
    address_details: jsonbRecord,
    notes: nullableString,

    // ==========================================
    // 4. SYSTEM CONTAINERS & AUDIT
    // ==========================================
    commission_items: z.array(z.any()).optional().nullable(),
    payments: z.array(z.any()).optional().nullable(),
    custom_attributes: z.record(z.string(), z.any()).optional().nullable(),
    archived: z.boolean().optional().nullable(),
    created_at: nullableString,
    created_by: nullableString,
    updated_at: nullableString,
    updated_by: nullableString,
  });

export type CreateTransactionInput = z.infer<typeof CreateTransactionSchema>;