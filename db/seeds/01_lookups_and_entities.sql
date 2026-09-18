-- ====================================================================
-- Soleox DEMO Seed Data: Step 1 - Lookup Values & Commission Entities
-- Nomenclature: CLV_<12_HEX>, ENT_<12_HEX>
-- ====================================================================

-- 1. Insert Client Lookup Values (Groups)
INSERT INTO public.client_lookup_values (id, client_id, category, option_label, option_value, sort_order, is_active, is_default, archived)
VALUES
  ('CLV_893A4F1B0001', 'DEMO', 'GROUP_ID', 'Group A', 'Group A', 3, TRUE, FALSE, FALSE),
  ('CLV_893A4F1B0002', 'DEMO', 'GROUP_ID', 'Group B', 'Group B', 4, TRUE, FALSE, FALSE)
ON CONFLICT (id) DO UPDATE SET
  option_label = EXCLUDED.option_label,
  is_active = TRUE;

-- 2. Insert Commission Entities (all ENT_<12_HEX>)
INSERT INTO public.commission_entities (id, client_id, entity_name, entity_type, is_active, archived, created_by, updated_by)
VALUES
  ('ENT_2C8AEE9D0B8B', 'DEMO', 'Broker Cap', 'BROKERAGE', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_8A1280374861', 'DEMO', 'Broker Fee', 'BROKERAGE', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_E2D75EE0A98C', 'DEMO', 'Broker Review', 'BROKERAGE', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_8AE838232CC6', 'DEMO', 'Miscellaneous', 'OTHER', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_F4184EDD6472', 'DEMO', 'Photos', 'VENDOR', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_EDC3FE414E79', 'DEMO', 'Referral', 'OTHER', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_561E2978DC23', 'DEMO', 'Risk Mgmt', 'BROKERAGE', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_528A6E37230F', 'DEMO', 'Staging', 'VENDOR', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_2144C1AD6DA3', 'DEMO', 'Stock', 'EQUITY', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_95D8B41E1346', 'DEMO', 'TC Fee', 'TEAM', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_B76F6B1B27BB', 'DEMO', 'Assistant Sarah', 'OTHER', TRUE, FALSE, 'system_seed', 'system_seed'),
  ('ENT_099423CE38DA', 'DEMO', 'Broker', 'BROKERAGE', TRUE, FALSE, 'system_seed', 'system_seed')
ON CONFLICT (id) DO UPDATE SET
  entity_name = EXCLUDED.entity_name,
  is_active = TRUE,
  archived = FALSE;
