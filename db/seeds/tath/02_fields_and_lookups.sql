-- ====================================================================
-- Soleox TATH Seed, file 02: field configurations and lookup values
-- Run after 01. Safe to run twice: a row is skipped if the same client, table and
-- field key (or client, category and label) already exists.
-- Field settings follow DEMO, with TATH's own names, sections and options.
-- ====================================================================

BEGIN;

INSERT INTO public.client_field_configurations (
  id, client_id, target_table, field_key, field_label, field_type, storage_type,
  section_name, section_sort_order, sort_order, is_required, is_system, is_enabled,
  dropdown_options, calculation_formula
)
SELECT v.*
FROM (VALUES
  ('CFG_EC09C41DA11A', 'TATH', 'transactions', 'id', 'Transaction ID', 'TEXT', 'CORE_COLUMN', 'Deal Essentials', 1, 1, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_4DF9886DAE7D', 'TATH', 'transactions', 'transaction_status', 'Status', 'SELECT', 'CORE_COLUMN', 'Deal Essentials', 1, 2, TRUE, TRUE, TRUE, ARRAY['Upcoming','Coming Soon','Active','Pending','Closed','Expired','Withdrawn','Cancelled','Incomplete']::text[], NULL),
  ('CFG_ACA451AE75B4', 'TATH', 'transactions', 'transaction_side', 'Side', 'SELECT', 'CORE_COLUMN', 'Deal Essentials', 1, 3, TRUE, TRUE, TRUE, ARRAY['Buyer','Seller','Tenant','Landlord','Referred Buyer','Referred Seller']::text[], NULL),
  ('CFG_DA5D5A6E78DA', 'TATH', 'transactions', 'agent_id', 'Primary Agent', 'AGENT_PICKER', 'CORE_COLUMN', 'Deal Essentials', 1, 4, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_C98E26CEC071', 'TATH', 'transactions', 'property_address', 'Property Address', 'TEXT', 'CORE_COLUMN', 'Deal Essentials', 1, 5, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_E7A868B8CF39', 'TATH', 'transactions', 'custom_property_type', 'Property Type', 'SELECT', 'CUSTOM_JSON', 'Deal Essentials', 1, 6, FALSE, FALSE, TRUE, ARRAY['Residential','Land']::text[], NULL),
  ('CFG_2234CE040AFB', 'TATH', 'transactions', 'transaction_coordinator', 'Transaction Coordinator', 'SELECT', 'CORE_COLUMN', 'Deal Essentials', 1, 7, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_8EB75D3B02E3', 'TATH', 'transactions', 'notes', 'Notes', 'TEXT', 'CORE_COLUMN', 'Deal Essentials', 1, 8, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_938C22916FBA', 'TATH', 'transactions', 'client_name', 'Client Name', 'TEXT', 'CORE_COLUMN', 'Lead Info', 2, 1, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_6C8B7433A87F', 'TATH', 'transactions', 'lead_source', 'Lead Source', 'SELECT', 'CORE_COLUMN', 'Lead Info', 2, 2, FALSE, FALSE, TRUE, ARRAY['#Agent Lead','Zillow Flex','[ No Lead Source ]','#Personal Transaction','kvCORE Team Website','Dylan Personal','Team Referral: Agent','Unknown','LIH','Luxury','Team Referral: Bigger Pockets','kvCORE Booked Appt.','Spokane Team Referral: Ronnie','YouTube','Kauai Team Referral: Ronnie','Team Referral: Evolve','Upnest/Realtor.com','[ Pending Entry ]']::text[], NULL),
  ('CFG_60B2D46AA5C9', 'TATH', 'transactions', 'custom_client_email', 'Client Email', 'TEXT', 'CUSTOM_JSON', 'Lead Info', 2, 3, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_85366791015A', 'TATH', 'transactions', 'custom_client_phone', 'Client Phone', 'TEXT', 'CUSTOM_JSON', 'Lead Info', 2, 4, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_9A28ED697AC9', 'TATH', 'transactions', 'list_date', 'List Date', 'DATE', 'CORE_COLUMN', 'Key Dates', 3, 2, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_9D76564F9E89', 'TATH', 'transactions', 'acceptance_date', 'Acceptance Date', 'DATE', 'CORE_COLUMN', 'Key Dates', 3, 3, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_40937A6D7BDD', 'TATH', 'transactions', 'closing_date', 'Closing Date', 'DATE', 'CORE_COLUMN', 'Key Dates', 3, 4, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_51191FD85470', 'TATH', 'transactions', 'list_price', 'List Price', 'CURRENCY', 'CORE_COLUMN', 'Financials', 4, 1, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_35CE56FEA477', 'TATH', 'transactions', 'sales_price', 'Sales Price', 'CURRENCY', 'CORE_COLUMN', 'Financials', 4, 2, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_4BCD06E40903', 'TATH', 'transactions', 'gci_type', 'GCI Type', 'SELECT', 'CORE_COLUMN', 'Financials', 4, 3, TRUE, TRUE, TRUE, ARRAY['PERCENTAGE','FLAT FEE']::text[], NULL),
  ('CFG_BC51A899CBC9', 'TATH', 'transactions', 'gci_perc', 'GCI %', 'PERCENT', 'CORE_COLUMN', 'Financials', 4, 4, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_92187B4401F4', 'TATH', 'transactions', 'gci_amount', 'GCI Amount', 'CURRENCY', 'CORE_COLUMN', 'Financials', 4, 5, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_A9C8EF8ED13F', 'TATH', 'transactions', 'transaction_fee', 'Transaction Fee', 'CURRENCY', 'CORE_COLUMN', 'Financials', 4, 6, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_0444A3E61AB3', 'TATH', 'transactions', 'total_commission', 'Total Commission', 'CURRENCY', 'CORE_COLUMN', 'Financials', 4, 7, TRUE, TRUE, TRUE, ARRAY[]::text[], 'gci_amount + transaction_fee'),
  ('CFG_DC06A2D489EC', 'TATH', 'transactions', 'finance_status', 'Finance Status', 'SELECT', 'CORE_COLUMN', 'Settlement', 5, 1, FALSE, FALSE, TRUE, ARRAY['Pending','Paid']::text[], NULL),
  ('CFG_5E0FDFF25C12', 'TATH', 'transactions', 'tms_id', 'TMS ID', 'TEXT', 'CORE_COLUMN', 'Transaction Management System', 6, 1, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_D8BBDE6B45C2', 'TATH', 'transactions', 'custom_referral', 'Referral in TMS', 'TEXT', 'CUSTOM_JSON', 'Transaction Management System', 6, 2, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_3A323893A520', 'TATH', 'transactions', 'custom_commission_splits', 'Commissions in TMS', 'TEXT', 'CUSTOM_JSON', 'Transaction Management System', 6, 3, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_A364E53464C4', 'TATH', 'transactions', 'custom_source_in_tms', 'Source in TMS', 'TEXT', 'CUSTOM_JSON', 'Transaction Management System', 6, 4, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_9C0B1424E851', 'TATH', 'transactions', 'custom_tc_fee', 'TC Fee', 'CURRENCY', 'CUSTOM_JSON', 'Transaction Management System', 6, 5, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_CDD2E1EC86E0', 'TATH', 'transactions', 'custom_legacy_id', 'Legacy ID', 'TEXT', 'CUSTOM_JSON', 'Transaction Management System', 6, 6, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_F90633C61044', 'TATH', 'transactions', 'lender_company', 'Lender Company', 'TEXT', 'CORE_COLUMN', 'Lending & Closing', 7, 1, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_17A4EEFC331B', 'TATH', 'transactions', 'custom_loan_officer', 'Loan Officer', 'TEXT', 'CUSTOM_JSON', 'Lending & Closing', 7, 2, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_1EC3414ED92F', 'TATH', 'transactions', 'custom_loan_type', 'Loan Type', 'SELECT', 'CUSTOM_JSON', 'Lending & Closing', 7, 3, FALSE, FALSE, TRUE, ARRAY['Home Loan','Cash','Conventional','Other','VA','FHA']::text[], NULL),
  ('CFG_00BBB89A8766', 'TATH', 'transactions', 'custom_escrow_company', 'Escrow Company', 'TEXT', 'CUSTOM_JSON', 'Lending & Closing', 7, 4, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_633CC1AB6450', 'TATH', 'transactions', 'title_company', 'Title Company', 'TEXT', 'CORE_COLUMN', 'Lending & Closing', 7, 5, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_20D392080B3D', 'TATH', 'transactions', 'custom_closing_officer', 'Closing Officer', 'TEXT', 'CUSTOM_JSON', 'Lending & Closing', 7, 6, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_2F66516141FB', 'TATH', 'transactions', 'custom_co_broker_company', 'Co-Broker Company', 'TEXT', 'CUSTOM_JSON', 'Co-Broker', 8, 1, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_FF4E41AAB389', 'TATH', 'transactions', 'custom_co_broker_agent', 'Co-Broker Agent', 'TEXT', 'CUSTOM_JSON', 'Co-Broker', 8, 2, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_4094E045F6BE', 'TATH', 'agents', 'id', 'Agent ID', 'TEXT', 'CORE_COLUMN', 'Identity & Status', 1, 1, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_7DA354310AD8', 'TATH', 'agents', 'agent_name', 'Full Name', 'TEXT', 'CORE_COLUMN', 'Identity & Status', 1, 2, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_5F6BEDF7E7AA', 'TATH', 'agents', 'group_id', 'Group / Team', 'SELECT', 'CORE_COLUMN', 'Identity & Status', 1, 3, TRUE, TRUE, TRUE, ARRAY['Kona','O''ahu','Hilo','-- Unknown --','Las Vegas','Maui','Kaua''i','Big Island','Northwest','California']::text[], NULL),
  ('CFG_0A20E07BE7D1', 'TATH', 'agents', 'agent_email', 'Email Address', 'TEXT', 'CORE_COLUMN', 'Identity & Status', 1, 4, TRUE, TRUE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_F88CBE90B489', 'TATH', 'agents', 'agent_status', 'Agent Status', 'SELECT', 'CORE_COLUMN', 'Identity & Status', 1, 5, TRUE, TRUE, TRUE, ARRAY['Active','Released']::text[], NULL),
  ('CFG_28CC6A23A345', 'TATH', 'agents', 'is_team_lead', 'Team Lead', 'BOOLEAN', 'CORE_COLUMN', 'Identity & Status', 1, 6, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_1D49AE020DE6', 'TATH', 'agents', 'agent_phone', 'Phone Number', 'TEXT', 'CORE_COLUMN', 'Identity & Status', 1, 7, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_B62C43750707', 'TATH', 'agents', 'custom_team_join_date', 'Team Join Date', 'DATE', 'CUSTOM_JSON', 'Identity & Status', 1, 8, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_C8BB9D7A5526', 'TATH', 'agents', 'custom_exp_cap_date', 'eXp Cap Date', 'DATE', 'CUSTOM_JSON', 'Caps', 2, 1, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_47E02A5C4FAC', 'TATH', 'agents', 'custom_company_comm_cap', 'Company Comm Cap', 'CURRENCY', 'CUSTOM_JSON', 'Caps', 2, 2, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_C8FEBCBAF3E0', 'TATH', 'agents', 'custom_exp_250_fee_cap', 'eXp 250 Fee Cap', 'CURRENCY', 'CUSTOM_JSON', 'Caps', 2, 3, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_2961510C324F', 'TATH', 'agents', 'custom_liability_cap', 'Liability Cap', 'CURRENCY', 'CUSTOM_JSON', 'Caps', 2, 4, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_92910F7B126C', 'TATH', 'agents', 'custom_stock', 'Stock', 'PERCENT', 'CUSTOM_JSON', 'Caps', 2, 5, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_AB9EF14702B1', 'TATH', 'agents', 'custom_agent_lead_split', 'Agent Lead Split', 'PERCENT', 'CUSTOM_JSON', 'Team Cap', 3, 1, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL),
  ('CFG_328815E6B8CF', 'TATH', 'agents', 'custom_team_cap_amount', 'Team Cap Amount', 'CURRENCY', 'CUSTOM_JSON', 'Team Cap', 3, 2, FALSE, FALSE, TRUE, ARRAY[]::text[], NULL)
) AS v(id, client_id, target_table, field_key, field_label, field_type, storage_type,
       section_name, section_sort_order, sort_order, is_required, is_system, is_enabled,
       dropdown_options, calculation_formula)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_field_configurations c
  WHERE c.client_id = v.client_id AND c.target_table = v.target_table AND c.field_key = v.field_key
);

INSERT INTO public.client_lookup_values (
  id, client_id, category, option_label, option_value, sort_order, is_active, is_default, archived
)
SELECT v.*
FROM (VALUES
  ('CLV_DC46D5F4A962', 'TATH', 'GROUP_ID', 'Kona', 'Kona', 1, TRUE, FALSE, FALSE),
  ('CLV_9FD4430290CD', 'TATH', 'GROUP_ID', 'O''ahu', 'O''ahu', 2, TRUE, FALSE, FALSE),
  ('CLV_193BF7996B49', 'TATH', 'GROUP_ID', 'Hilo', 'Hilo', 3, TRUE, FALSE, FALSE),
  ('CLV_9D9F1770DA03', 'TATH', 'GROUP_ID', '-- Unknown --', '-- Unknown --', 4, TRUE, FALSE, FALSE),
  ('CLV_A0440B8D15EC', 'TATH', 'GROUP_ID', 'Las Vegas', 'Las Vegas', 5, TRUE, FALSE, FALSE),
  ('CLV_5E6C0920E0DB', 'TATH', 'GROUP_ID', 'Maui', 'Maui', 6, TRUE, FALSE, FALSE),
  ('CLV_DA9A5CAEA057', 'TATH', 'GROUP_ID', 'Kaua''i', 'Kaua''i', 7, TRUE, FALSE, FALSE),
  ('CLV_2876FD7E5103', 'TATH', 'GROUP_ID', 'Big Island', 'Big Island', 8, TRUE, FALSE, FALSE),
  ('CLV_5D09033E3918', 'TATH', 'GROUP_ID', 'Northwest', 'Northwest', 9, TRUE, FALSE, FALSE),
  ('CLV_0A60B4F06F8D', 'TATH', 'GROUP_ID', 'California', 'California', 10, TRUE, FALSE, FALSE),
  ('CLV_322D738392EB', 'TATH', 'AGENT_STATUS', 'Active', 'Active', 1, TRUE, FALSE, FALSE),
  ('CLV_7CA689DC6D32', 'TATH', 'AGENT_STATUS', 'Released', 'Released', 2, TRUE, FALSE, FALSE),
  ('CLV_8D0C0118778C', 'TATH', 'LEAD_SOURCE', '#Agent Lead', '#Agent Lead', 1, TRUE, FALSE, FALSE),
  ('CLV_D88BFB11EA0F', 'TATH', 'LEAD_SOURCE', 'Zillow Flex', 'Zillow Flex', 2, TRUE, FALSE, FALSE),
  ('CLV_AF3C6AC36AFD', 'TATH', 'LEAD_SOURCE', '[ No Lead Source ]', '[ No Lead Source ]', 3, TRUE, FALSE, FALSE),
  ('CLV_086DC72F5714', 'TATH', 'LEAD_SOURCE', '#Personal Transaction', '#Personal Transaction', 4, TRUE, FALSE, FALSE),
  ('CLV_83B59B76579E', 'TATH', 'LEAD_SOURCE', 'kvCORE Team Website', 'kvCORE Team Website', 5, TRUE, FALSE, FALSE),
  ('CLV_D1AF7B1A6EBF', 'TATH', 'LEAD_SOURCE', 'Dylan Personal', 'Dylan Personal', 6, TRUE, FALSE, FALSE),
  ('CLV_2469EEB64068', 'TATH', 'LEAD_SOURCE', 'Team Referral: Agent', 'Team Referral: Agent', 7, TRUE, FALSE, FALSE),
  ('CLV_525305069920', 'TATH', 'LEAD_SOURCE', 'Unknown', 'Unknown', 8, TRUE, FALSE, FALSE),
  ('CLV_6BAD1B14D289', 'TATH', 'LEAD_SOURCE', 'LIH', 'LIH', 9, TRUE, FALSE, FALSE),
  ('CLV_A1F7788A1157', 'TATH', 'LEAD_SOURCE', 'Luxury', 'Luxury', 10, TRUE, FALSE, FALSE),
  ('CLV_FAB164BC3F4E', 'TATH', 'LEAD_SOURCE', 'Team Referral: Bigger Pockets', 'Team Referral: Bigger Pockets', 11, TRUE, FALSE, FALSE),
  ('CLV_B57F0E08C937', 'TATH', 'LEAD_SOURCE', 'kvCORE Booked Appt.', 'kvCORE Booked Appt.', 12, TRUE, FALSE, FALSE),
  ('CLV_D351B72B9617', 'TATH', 'LEAD_SOURCE', 'Spokane Team Referral: Ronnie', 'Spokane Team Referral: Ronnie', 13, TRUE, FALSE, FALSE),
  ('CLV_E211D8AAC8DC', 'TATH', 'LEAD_SOURCE', 'YouTube', 'YouTube', 14, TRUE, FALSE, FALSE),
  ('CLV_78A630B8E0E1', 'TATH', 'LEAD_SOURCE', 'Kauai Team Referral: Ronnie', 'Kauai Team Referral: Ronnie', 15, TRUE, FALSE, FALSE),
  ('CLV_4F1756DDB04B', 'TATH', 'LEAD_SOURCE', 'Team Referral: Evolve', 'Team Referral: Evolve', 16, TRUE, FALSE, FALSE),
  ('CLV_3D3D9F94835C', 'TATH', 'LEAD_SOURCE', 'Upnest/Realtor.com', 'Upnest/Realtor.com', 17, TRUE, FALSE, FALSE),
  ('CLV_5F0F11271026', 'TATH', 'LEAD_SOURCE', '[ Pending Entry ]', '[ Pending Entry ]', 18, TRUE, FALSE, FALSE),
  ('CLV_32EE2DF4A363', 'TATH', 'TRANSACTION_STATUS', 'Upcoming', 'Upcoming', 1, TRUE, FALSE, FALSE),
  ('CLV_FD90046FC93B', 'TATH', 'TRANSACTION_STATUS', 'Coming Soon', 'Coming Soon', 2, TRUE, FALSE, FALSE),
  ('CLV_43E683594267', 'TATH', 'TRANSACTION_STATUS', 'Active', 'Active', 3, TRUE, FALSE, FALSE),
  ('CLV_79457FD2A388', 'TATH', 'TRANSACTION_STATUS', 'Pending', 'Pending', 4, TRUE, FALSE, FALSE),
  ('CLV_5C281173CE6A', 'TATH', 'TRANSACTION_STATUS', 'Closed', 'Closed', 5, TRUE, FALSE, FALSE),
  ('CLV_3863C9AAA3FA', 'TATH', 'TRANSACTION_STATUS', 'Expired', 'Expired', 6, TRUE, FALSE, FALSE),
  ('CLV_9B77B43C2019', 'TATH', 'TRANSACTION_STATUS', 'Withdrawn', 'Withdrawn', 7, TRUE, FALSE, FALSE),
  ('CLV_039B1214D35A', 'TATH', 'TRANSACTION_STATUS', 'Cancelled', 'Cancelled', 8, TRUE, FALSE, FALSE),
  ('CLV_A44DEC33BAF2', 'TATH', 'TRANSACTION_STATUS', 'Incomplete', 'Incomplete', 9, TRUE, FALSE, FALSE),
  ('CLV_102841BC4CEC', 'TATH', 'TRANSACTION_SIDE', 'Buyer', 'Buyer', 1, TRUE, FALSE, FALSE),
  ('CLV_B8112D0DAB9F', 'TATH', 'TRANSACTION_SIDE', 'Seller', 'Seller', 2, TRUE, FALSE, FALSE),
  ('CLV_A7E71947E667', 'TATH', 'TRANSACTION_SIDE', 'Tenant', 'Tenant', 3, TRUE, FALSE, FALSE),
  ('CLV_7F24281100B7', 'TATH', 'TRANSACTION_SIDE', 'Landlord', 'Landlord', 4, TRUE, FALSE, FALSE),
  ('CLV_5B82D4E11C82', 'TATH', 'TRANSACTION_SIDE', 'Referred Buyer', 'Referred Buyer', 5, TRUE, FALSE, FALSE),
  ('CLV_E975F4AAFDED', 'TATH', 'TRANSACTION_SIDE', 'Referred Seller', 'Referred Seller', 6, TRUE, FALSE, FALSE),
  ('CLV_C9804901E4CE', 'TATH', 'FINANCE_STATUS', 'Pending', 'Pending', 1, TRUE, FALSE, FALSE),
  ('CLV_DDA1A37F6E34', 'TATH', 'FINANCE_STATUS', 'Paid', 'Paid', 2, TRUE, FALSE, FALSE),
  ('CLV_CEE776E45FAE', 'TATH', 'GCI_TYPE', 'PERCENTAGE', 'PERCENTAGE', 1, TRUE, TRUE, FALSE),
  ('CLV_CA8874B8CBD2', 'TATH', 'GCI_TYPE', 'FLAT FEE', 'FLAT FEE', 2, TRUE, FALSE, FALSE),
  ('CLV_B4F693BD5123', 'TATH', 'CUSTOM_LOAN_TYPE', 'Home Loan', 'Home Loan', 1, TRUE, FALSE, FALSE),
  ('CLV_EBEFB2A3BA8D', 'TATH', 'CUSTOM_LOAN_TYPE', 'Cash', 'Cash', 2, TRUE, FALSE, FALSE),
  ('CLV_E887D3B1AFFB', 'TATH', 'CUSTOM_LOAN_TYPE', 'Conventional', 'Conventional', 3, TRUE, FALSE, FALSE),
  ('CLV_D0465B3A89A6', 'TATH', 'CUSTOM_LOAN_TYPE', 'Other', 'Other', 4, TRUE, FALSE, FALSE),
  ('CLV_AFFC9F53892D', 'TATH', 'CUSTOM_LOAN_TYPE', 'VA', 'VA', 5, TRUE, FALSE, FALSE),
  ('CLV_562159F19C58', 'TATH', 'CUSTOM_LOAN_TYPE', 'FHA', 'FHA', 6, TRUE, FALSE, FALSE),
  ('CLV_2B7FA7E2B531', 'TATH', 'CUSTOM_PROPERTY_TYPE', 'Residential', 'Residential', 1, TRUE, FALSE, FALSE),
  ('CLV_0888502A91AE', 'TATH', 'CUSTOM_PROPERTY_TYPE', 'Land', 'Land', 2, TRUE, FALSE, FALSE)
) AS v(id, client_id, category, option_label, option_value, sort_order, is_active, is_default, archived)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_lookup_values l
  WHERE l.client_id = v.client_id AND l.category = v.category AND l.option_label = v.option_label
);

COMMIT;

-- Check (read only): expect 37 transaction fields, 15 agent fields, 57 lookup values
-- SELECT target_table, count(*) FROM public.client_field_configurations WHERE client_id = 'TATH' GROUP BY 1;
-- SELECT count(*) FROM public.client_lookup_values WHERE client_id = 'TATH';
