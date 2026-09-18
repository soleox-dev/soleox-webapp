# Soleox REBT (Real Estate Business Tracker) — System Architecture & Data Dictionary

## 1. System Overview & Technology Stack

Soleox REBT is a multi-tenant enterprise commission tracking and business intelligence web application designed for real estate teams and brokerages.

- **Framework**: Next.js 16 (App Router) with React 19
- **Language**: TypeScript (Strict typing)
- **Database & Backend**: Supabase (PostgreSQL 15+)
- **Security & Multi-Tenancy**: PostgreSQL Row Level Security (RLS) driven by custom 5-minute symmetric JWTs (`auth.email()`, `public.is_client_member()`, `public.is_client_admin()`)
- **Authentication**: NextAuth.js (Auth.js) with Google & Azure AD OAuth
- **Styling**: Tailwind CSS with dark/light themes and custom CSS variables

---

## 2. Global Primary Key & Unique ID Nomenclature

Every relational table in the database adheres to a strict, standardized ID format generated via the PostgreSQL security function `public.generate_prefixed_id(prefix text)`:

$$\text{ID Format: } \mathbf{[PREFIX]\_[12\_UPPERCASE\_HEX\_DIGITS]}$$

Example: `TXN_6C59DB33ADE8` (Length: 16 characters total).

### Master Table ID Prefix Registry

| Table Name | Prefix | Example ID | Description & Foreign Key References |
| :--- | :---: | :--- | :--- |
| `clients` | `CLI_` | `CLI_4A2B8C1D9E0F` *(or slug `DEMO`)* | Tenant client organization master records. |
| `web_users` | `USR_` | `USR_0000000001` | System user accounts identified by OAuth email. |
| `client_user_roles` | `CUR_` | `CUR_0000000001` | Role-based memberships mapping `user_id` $\rightarrow$ `client_id`. |
| `role_permissions` | `RP_` | `RP_2E3F4A5B6C7D` | Granular permission toggles assigned to tenant roles. |
| `client_field_configurations` | `CFC_` | `CFC_4F8A77CBF7B9` | Dynamic schema field configuration per tenant table. |
| `client_lookup_values` | `CLV_` | `CLV_AD77A1FEAE0B` | System and custom dropdown options grouped by `category`. |
| `agents` | `AGT_` | `AGT_A8C5F636713A` | Real estate agents belonging to a client tenant. |
| `commission_entities` | `ENT_` | `ENT_2C8AEE9D0B8B` | Payee entities (Brokerage, Vendors, Deductions, Teams). |
| `commission_templates` | `TPL_` | `TPL_3A4B5C6D7E8F` | Calculation rule sets for commission distribution. |
| `commission_template_parameters` | `CTP_` | `CTP_1A2B3C4D5E6F` | Dynamic parameters defined for commission templates. |
| `commission_template_logic` | `CTL_` | `CTL_9A8B7C6D5E4F` | Step-by-step logic nodes in a commission template. |
| `commission_template_submissions`| `CTS_` | `CTS_5E6F7A8B9C0D` | Audit snapshots of calculated commission runs. |
| `transactions` | `TXN_` | `TXN_6C59DB33ADE8` | Real estate transactions/deals. External IDs live in `tms_id`. |
| `transaction_commission_items` | `TCI_` | `TCI_7DE0AA0AD2AB` | Granular waterfall ledger entries linked to a `transaction_id`. |
| `payments` | `PAY_` | `PAY_4A5B6C7D8E9F` | Actual disbursements and payouts linked to a `transaction_id`. |

---

## 3. Entity Conventions & Formatting Rules

### A. Agent Identity (`agents`)
1. **Primary Key**: Always formatted as `AGT_<12_HEX_CHARS>`.
2. **Display Name (`agent_name`)**: Always stored in standard human reading order: **`First Last`** (e.g. `Brennan Devon`, `Robert Ito`, `Marta Estocolmo`).
3. **Structured Name Parsing**:
   - In `custom_attributes`: Stored as `{ "first_name": "Brennan", "last_name": "Devon" }`.
   - Legacy CSV imports formatted as `Last, First` (e.g. `"Devon, Brennan"`) must be inverted into `First Last`.
   - Names must never be used as primary keys or surrogate keys.

### B. Transactions (`transactions`)
1. **Primary Key**: Always formatted as `TXN_<12_HEX_CHARS>`.
2. **TMS / Legacy ID (`tms_id`)**: Stores external system deal IDs (such as `TR000484`, `TR000006`, SkySlope/Dotloop IDs). This ensures foreign software identifiers never compromise the primary key standard.
3. **Primary Agent Link (`agent_id`)**: Strictly references `agents.id` (`AGT_<HEX>`).
4. **Waterfall State**: Embedded JSON in `custom_attributes` (`agents`, `offTheTopRules`, `postSplitRulesByAgent`) references agents by valid `id` (`AGT_<HEX>`) and `name` (`First Last`).

### C. Commission Items (`transaction_commission_items`)
1. **Primary Key**: Always formatted as `TCI_<12_HEX_CHARS>`.
2. **Parent Deal**: Strictly references `transactions.id` (`TXN_<HEX>`).
3. **Agent Link**: When `payee_type = 'AGENT'`, `agent_id` references `agents.id` (`AGT_<HEX>`).
4. **Entity Link**: When `payee_type IN ('ENTITY', 'BROKERAGE')`, `payee_entity_id` references `commission_entities.id` (`ENT_<HEX>`).

### D. Payments & Disbursements (`payments`)
1. **Primary Key**: Always formatted as `PAY_<12_HEX_CHARS>`.
2. **Parent Deal**: Strictly references `transactions.id` (`TXN_<HEX>`).
3. **Item Link**: Optionally links to `transaction_commission_items.id` (`TCI_<HEX>`).

---

## 4. Multi-Tenant Isolation (RLS)

All client-facing tables contain a `client_id text NOT NULL` column. PostgreSQL Row-Level Security evaluates the caller's JWT:

```sql
auth.email() := COALESCE(
  NULLIF(current_setting('request.jwt.claim.email', true), ''),
  (current_setting('request.jwt.claims', true)::jsonb ->> 'email')
)
```

1. **Member Policy**: `is_client_member(client_id)` grants read access to all tenant records where the user has an active membership in `client_user_roles`.
2. **Admin Policy**: `is_client_admin(client_id)` grants insert/update/delete access only when `client_user_roles.role = 'ADMIN'`.
3. **System Service Role**: Background jobs, seed migrations, and emergency maintenance scripts operate with the `service_role` key bypassing RLS.
