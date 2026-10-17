-- ====================================================================
-- Soleox TATH Seed, file 01: client and access
-- Client: TATH (The Agency Team Hawaii)
-- Run order: 01 first. Safe to run twice: every insert is skipped if the row exists.
-- Requires migrations 047 and 048 (already applied).
-- Reads nothing from DEMO at run time. DEMO's views and scorecards are copied below.
-- ====================================================================

BEGIN;

-- 1. Client
INSERT INTO public.clients (
  id, client_name, status, client_type, track_detailed_payments, require_compliance_approval,
  subscription_plan, subscription_status, currency_code, default_financial_visibility,
  settings_json, archived, created_by, updated_by
)
VALUES (
  'TATH', 'The Agency Team Hawaii', 'ACTIVE', 'BROKERAGE', TRUE, TRUE,
  'STARTER', 'ACTIVE', 'USD', 'FULL',
  '{
  "transaction_views": {
    "views": [
      {
        "id": "finished",
        "name": "Finished",
        "sort_rules": [
          {
            "direction": "asc",
            "field_key": "closing_date"
          }
        ],
        "filter_formula": "OR(transaction_status=\"Cancelled\", AND(transaction_status=\"Closed\", finance_status=\"Paid\"))"
      },
      {
        "id": "unfinished",
        "name": "Unfinished",
        "sort_rules": [
          {
            "direction": "asc",
            "field_key": "closing_date"
          }
        ],
        "filter_formula": "AND(transaction_status<>\"Cancelled\", NOT(AND(transaction_status=\"Closed\", finance_status=\"Paid\")))"
      }
    ],
    "default_view_id": "unfinished"
  },
  "transaction_scorecards": [
    {
      "id": "sc_active",
      "name": "Active",
      "color": "blue",
      "metrics": [
        {
          "kind": "count",
          "name": "Units"
        },
        {
          "kind": "sum",
          "name": "Active List Volume",
          "field_key": "list_price"
        }
      ],
      "filter_formula": "transaction_status=\"Active\""
    },
    {
      "id": "sc_pending",
      "name": "Pending",
      "color": "yellow",
      "metrics": [
        {
          "kind": "count",
          "name": "Units"
        },
        {
          "kind": "sum",
          "name": "Pending Volume",
          "field_key": "sales_price"
        }
      ],
      "filter_formula": "transaction_status=\"Pending\""
    },
    {
      "id": "sc_closed",
      "name": "Closed",
      "color": "green",
      "metrics": [
        {
          "kind": "count",
          "name": "Units"
        },
        {
          "kind": "sum",
          "name": "Closed Volume",
          "field_key": "sales_price"
        }
      ],
      "filter_formula": "transaction_status=\"Closed\""
    },
    {
      "id": "sc_cancelled",
      "name": "Cancelled",
      "color": "red",
      "metrics": [
        {
          "kind": "count",
          "name": "Units"
        },
        {
          "kind": "sum",
          "name": "Cancelled Volume",
          "field_key": "sales_price"
        }
      ],
      "filter_formula": "transaction_status=\"Cancelled\""
    }
  ],
  "transaction_default_view": {
    "sort_rules": [
      {
        "direction": "asc",
        "field_key": "closing_date"
      }
    ],
    "filter_formula": "AND(transaction_status<>\"Cancelled\", NOT(AND(transaction_status=\"Closed\", finance_status=\"Paid\")))"
  }
}'::jsonb,
  FALSE, 'tath-seed', 'tath-seed'
)
ON CONFLICT (id) DO NOTHING;

-- 2. New user: carlosbes@hotmail.com (TATH only). Other accounts already exist.
INSERT INTO public.web_users (id, email, status, is_super_admin, archived, created_by, updated_by)
SELECT 'USR_8A682F2EE196', 'carlosbes@hotmail.com', 'ACTIVE', FALSE, FALSE, 'tath-seed', 'tath-seed'
WHERE NOT EXISTS (SELECT 1 FROM public.web_users WHERE lower(email) = 'carlosbes@hotmail.com');

-- 3. Roles on TATH, mirroring DEMO
--    carlos.bes@soleox.org     ADMIN (also platform super admin)
--    mysoleox@gmail.com        Commission Tracker Write
--    carlosbes@hotmail.com     Commission Tracker Read, TATH only (same as cbescomeras@gmail.com on DEMO)
--    cbescomeras@gmail.com     no TATH access
INSERT INTO public.client_user_roles (id, user_id, client_id, role, agent_access_scope, is_primary_team, is_active, created_by, updated_by)
SELECT v.id, u.id, 'TATH', v.role, 'OWN_TRANSACTIONS', v.is_primary_team, TRUE, 'tath-seed', 'tath-seed'
FROM (VALUES
  ('CUR_6EC542A638B8', 'carlos.bes@soleox.org', 'ADMIN', FALSE),
  ('CUR_012DCA08D27A', 'mysoleox@gmail.com', 'COMMISSION_TRACKER_WRITE', FALSE),
  ('CUR_409265E64827', 'carlosbes@hotmail.com', 'COMMISSION_TRACKER_READ', TRUE)
) AS v(id, email, role, is_primary_team)
JOIN public.web_users u ON lower(u.email) = lower(v.email)
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_user_roles r
  WHERE r.user_id = u.id AND r.client_id = 'TATH' AND r.role = v.role
);

COMMIT;

-- Check (read only): expect 1 client, 3 roles
-- SELECT id, client_name FROM public.clients WHERE id = 'TATH';
-- SELECT u.email, r.role FROM public.client_user_roles r JOIN public.web_users u ON u.id = r.user_id WHERE r.client_id = 'TATH' ORDER BY 1;
