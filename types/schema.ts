// =============================================================================
// PILLAR 3: TRANSACTIONS & WATERFALL LEDGER TYPES
// =============================================================================

export type TransactionSide = 'Seller' | 'Buyer' | 'Landlord' | 'Tenant';
export type GCIType = 'PERCENTAGE' | 'FLAT_FEE';
export type PayeeType = 'AGENT' | 'BROKERAGE' | 'ENTITY';
export type WaterfallSection = 'OFF_THE_TOP' | 'PRE_SPLIT' | 'POST_SPLIT' | 'AGENT_NET';

export interface CoBroker {
  agent?: string;
  company?: string;
  phone?: string;
  email?: string;
}

export interface SettlementVendors {
  lending_company?: string;
  loan_officer?: string;
  loan_type?: string;
  title_company?: string;
  title_officer?: string;
  escrow_company?: string;
  escrow_officer?: string;
  attorney?: string;
}

export interface AddressDetails {
  street?: string;
  city?: string;
  state?: string;
  postal_code?: string;
}

export interface Transaction {
  id: string;
  client_id: string;
  tms_id?: string;
  transaction_status: string;
  finance_status?: string;
  transaction_side: TransactionSide;
  property_address: string;
  client_name?: string;
  lead_source?: string;
  lead_owner?: string;
  list_price?: number;
  sales_price?: number;
  gci_type: GCIType;
  gci_perc?: number;
  gci_amount: number;
  total_commission?: number;
  transaction_fee?: number;
  list_date?: string;
  acceptance_date?: string;
  closing_date?: string;
  agent_id: string;
  agent_name?: string;
  primary_agent?: string;
  isa?: string[];
  transaction_coordinator?: string[];
  co_broker?: CoBroker;
  settlement_vendors?: SettlementVendors;
  address_details?: AddressDetails;
  notes?: string;
  custom_attributes?: Record<string, unknown>;
  archived: boolean;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

export interface TransactionCommissionItem {
  id: string;
  client_id: string;
  transaction_id: string;
  submission_id?: string;
  step_number: number;
  rule_name: string;
  section: WaterfallSection;
  payee_type: PayeeType;
  payee_entity_id?: string;
  agent_id?: string;
  calculated_amount: number;
  final_amount: number;
  is_manual_override: boolean;
  override_reason?: string;
  archived: boolean;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}

export interface Payment {
  id: string;
  client_id: string;
  transaction_id: string;
  commission_item_id: string;
  amount_paid: number;
  payment_date: string;
  payment_method: string;
  reference_number?: string;
  payment_status: 'PENDING' | 'COMPLETED' | 'VOIDED';
  notes?: string;
  archived: boolean;
  created_at: string;
  created_by?: string;
  updated_at: string;
  updated_by?: string;
}