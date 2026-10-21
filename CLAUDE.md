# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Soleox REBI (Real Estate Business Intelligence) is a multi-tenant B2B real estate intelligence, commission tracking, and reporting platform. This guide outlines the project's architecture, security boundaries, domain calculation engine, UI design conventions, and developer workflows.

---

## 1. Development & Build Commands

- **Start Local Dev Server**:
  ```bash
  npm run dev
  ```
  *Listens strictly on `http://127.0.0.1:3000` with Turbopack and 12GB allocated memory.*
- **Type Checking**:
  ```bash
  npx tsc --noEmit
  ```
- **Run Isolated Script / Quick Test**:
  ```bash
  npx tsx path/to/script.ts
  ```
- **Production Build** (no `build` script is defined):
  ```bash
  npx next build
  ```
- **No test runner or linter is configured.** `npm test` is a stub that exits with an error, and there is no ESLint config. Verify changes with `npx tsc --noEmit` and, for engine logic, a throwaway `npx tsx` script.
- Do not start a second dev server on another port, re-enable `devIndicators`, or shrink the in-memory page buffer in `next.config.ts` (see `.cursor/rules/dev-navigation.mdc`).
- **Dependencies**: React 19, Next.js 16 (App Router), Tailwind CSS v4, Supabase JS v2, NextAuth v4, Zod, Lucide React.

---

## 2. Core Architecture & Stack

- **Framework**: Next.js (App Router, React 19, Turbopack)
- **Language**: TypeScript (strict mode enabled)
- **Styling**: Tailwind CSS v4 with a custom blocking script for light/dark theme. The interface uses the system font (SF Pro on Mac, Segoe UI on Windows; no web font is loaded), with tabular figures app-wide so money and dates line up; the system mono (`font-mono`) only for IDs, keys, and formulas. Table cells are regular weight, the column that names the row is medium, and only status chips and totals are semibold. Color roles: `brand-*` (the sky from the logo, defined in `app/globals.css`) marks what you can act on: focus, selection, active nav and tabs, primary buttons. Emerald means money in, paid, closed, or success. Amber is waiting, rose is a problem. Dark mode uses neutral near-blacks (slate-700 to 950 are retuned in the theme). Report colors follow `report-requirements.mdc`.
- **Database & BaaS**: Supabase (PostgreSQL with Row Level Security)
- **Authentication**: NextAuth.js (Auth.js) using Google & Microsoft Azure AD OAuth
- **Database Security Strategy (Custom JWT + RLS)**:
  - NextAuth handles the OAuth handshake.
  - The server signs a short-lived (5-minute) symmetric JWT containing `{ email: session.user.email }` signed with `SUPABASE_JWT_SECRET`.
  - The token is passed via `Authorization: Bearer <token>` to Supabase.
  - PostgreSQL Row Level Security (RLS) dynamically evaluates user permissions via:
    - `auth.email()`: Extracts the verified user email from the JWT claims.
    - `public.is_client_admin(target_client_id)`: Checks active admin status in `client_user_roles`.
  - **CRITICAL**: Never bypass RLS or use the `service_role` key in API routes unless executing system-level migrations.
  - The only existing `supabaseAdmin` (`lib/supabase-admin.ts`) callers are access/tenant resolution (`lib/access.ts`, `getTenantContext` in `lib/session.ts`), the hourly cron (`app/api/cron/transaction-sync`, scheduled in `vercel.json`), and `lib/google-sheet-connection.ts`. Feature routes use `requireSessionClient()`.

### Request Pipeline
- `proxy.ts` is the Next.js 16 middleware. Every page and API request passes through it except `/login`, `/api/auth/*`, and `/api/cron/*`. It verifies the NextAuth token, ends idle sessions (activity cookie), loads access via `loadAccessForEmail`, redirects users with no client to `/no-access`, gates routes by permission, and rate-limits API writes (`lib/rate-limit.ts`).
- The active tenant comes from the client cookie (`CLIENT_COOKIE`, chosen on `/select-client`). `requireSessionClient()` ignores any client id sent on the request.
- Return browser-safe errors with `publicError` / `apiError` from `lib/session.ts`; they keep Postgres/PostgREST details in the server log.

### Database Schema & Migrations
- Schema changes are numbered SQL files in `db/migrations/` (`001_…` through `057_post_split_history.sql`). Add the next number; never edit an applied migration. Seeds live in `db/seeds/`.
- Primary keys use `public.generate_prefixed_id(prefix)` → `PREFIX_<12 uppercase hex>` (e.g. `TXN_`, `AGT_`, `TCI_`, `ENT_`, `TPL_`, `CTR_`). External system IDs go in `tms_id`, never the primary key. Agent names are stored `First Last`. Full prefix registry and entity conventions: `ARCHITECTURE.md`.

---

## 3. API & Backend Patterns

All authenticated backend operations must resolve tenant context and enforce RLS:

```typescript
import { NextResponse } from 'next/server';
import { requireSessionClient, responseStatus } from '@/lib/session';

export async function POST(request: Request) {
  try {
    // 1. Validates session, extracts tenant client_id, and returns RLS Supabase client
    const { email, clientId, supabase } = await requireSessionClient();

    const body = await request.json();

    // 2. Perform Supabase queries scoped to clientId
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('client_id', clientId);

    if (error) throw error;
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: responseStatus(error) }
    );
  }
}
```

### Access & Roles
Full per-permission behavior (which buttons and columns each role hides, deferred permissions) is in `.cursor/rules/access-requirements.mdc`; read it before changing access, roles, or client switching. A page, menu entry, or API the user lacks stays closed even when its URL is opened directly.

- Permissions are scoped per `client_id` via `client_user_roles`:
  - `COMMISSION_TRACKER_READ`: Read-only view of Transactions & Agents (hides actions, edits, syncs).
  - `COMMISSION_TRACKER_WRITE`: Full read/write for Transactions, Agents, Submissions, and `client_caps`.
  - `COMMISSION_TRACKER_SETTINGS`: Manage templates, parameters, rules, and `client_caps`.
  - `OWNER_REPORTS`: Access to Owner Reports suite.
  - `ADMIN` / `SUPER_ADMIN`: All permissions within the tenant.
  - `web_users.is_super_admin`: Platform-wide access.
- **Access Cache**: `loadAccessForEmail` in `lib/access.ts` caches user access in memory (~1 minute) to avoid request stalls on navigation. Do not query the DB directly in `proxy.ts`.

---

## 4. Commission Engine & Waterfall Domain Rules

The Commission Waterfall Engine resides in:
- `app/(dashboard)/commission-tracker/transactions/[id]/components/` (`CommissionWaterfall.tsx`, `applyTemplateLogic.ts`, `CommissionTemplatePanel.tsx`)
- `app/(dashboard)/commission-tracker/settings/commission-templates/` (`FormulaEditor.tsx`, `formula-evaluator.ts`, `formula-validator.ts`, `formula-explainer.ts`)

### Terminology & State Behavior
- **Settings** displays **Rules** (stored in `commission_template_rules`).
- **Transaction detail** displays the read-only **Calculations** section.
- **Dollars vs. Percents**: An amount formula **always** computes a dollar value. The setting *"Show resulting waterfall split with percent"* is purely display formatting.
- **Drafts**:
  - Turning **Condition** or **Custom Baseline** off clears that formula.
  - Switching **Entity** between fixed and formula keeps both drafts in state, but saving writes only the active mode.
- **Parameters**: `parameter_key` is immutable after the first save and must be unique within that template.

### Formula Arithmetic Rules
- **Addition & Subtraction (`+`, `-`)**: Result is a percentage if **either** side is a percentage.
- **Multiplication (`*`)**: Result is a percentage **only if both** sides are percentages.
- **Division (`/`)**: Result is a percentage **only if the left side** is a percentage.

### 3-Tier Attribute Resolution (Data Miss vs. Schema Miss)
When resolving custom attributes or fields in formulas (e.g., `XLOOKUP(agent_1, agents.id, agents.custom_stock)`):
1. **Tier 1 (Tenant Dynamic Configuration)**: Look up `client_field_configurations` matching `target_table` and `field_key`.
2. **Tier 2 (Physical Native Schema)**: Check `KNOWN_TABLE_COLUMNS` for physical database columns (`agents`, `transactions`, etc.).
3. **Tier 3 (Living Record Attributes)**: Check if the attribute exists on **any** object currently loaded in the table dataset.

**Resolution Outcomes:**
- **Data Miss** (attribute is valid/configured, but null/unset on the matched record): Returns `{ type: 'blank' }`.
  - In comparisons, `{ type: 'blank' } <> ""` evaluates cleanly to `FALSE`. This prevents `OR(...)` from failing when optional fields are empty.
- **Schema Miss** (field does not exist in configuration or physical schema, or is a typo): Returns `{ type: 'error' }`.
  - Aborts formula execution and notifies the user that the rule cannot be calculated.

### Browser Module Cache Invalidation
`applyTemplateLogic.ts` caches `templateBundles`, `ledgerCache`, and `lookupTableCache` in memory.
- `loadFormulaLookups`, `loadTemplateBundle`, and `loadCommissionLedger` accept `{ refresh?: boolean }`.
- Any edit to Transaction Overview, the Waterfall Engine, or opening the Template Submission modal must invoke `clearCommissionModuleCache()` and `reloadAgents()` to prevent stale evaluation.

---

## 5. UI/UX & Component Standards

### Page Margins & Layout
- Page frames must match the Owner Reports filter layout.
- Wrap main page content in `pageFrame` from `@/lib/page-frame` (`mx-auto w-full max-w-[1600px] px-4 md:px-6`).
- Data pages (Transactions list, Agents list, Owner/Agent/Office Reports) use `widePageFrame` instead (`w-full px-4 md:px-6`, full screen width). `isWidePagePath` lists them so the top navigation matches; add a page there when it switches frames.
- Do not introduce nested max-widths or extra horizontal padding inside pages wrapped by `pageFrame` or `widePageFrame`.

### Form Controls
- **Inputs & Fields**: Use `underlineShell`, `underlineLabel`, `underlineControl`, and `UnderlineField` from `@/components/ui/underline-field`. Faint bottom underline that turns the brand sky on focus.
- **Single-Select Dropdowns**: Use `OptionMenu` or `ClearableSelect` from `@/components/ui/option-menu`.
- **Comboboxes / Custom Inputs**: Use `allowCustom` on `OptionMenu` for dropdowns that accept custom typed entries.
- **Commission Waterfall Inputs**: Waterfall amount/percentage inputs maintain their own compact styling. Do not alter their layout.

### Unsaved Changes Guard
- If a page has a visible, enabled **Save** button, wrap the view with `useRegisterSave` from `@/components/save-leave-guard`.
- Prevents navigation and displays the three-option dialog: **Save**, **Discard**, or **Stay**.

### Surfaces & Labels
- Page panels keep a border and at most `shadow-xs`; shadows are for things that float (menus, dialogs, the pinned search pill).
- Labels and chips use sentence case; do not force `uppercase` with wide tracking. Table column headers and scorecard labels use Title Case ("Closed Net Income", "Left to Cap", "Avg. Sales Price"): capitalize each word, keep short words like a, of, to, and lowercase unless first or last, and keep acronyms. Write the text that way; do not use CSS `capitalize`, which would also change names users typed.
  - Sentence case covers labels, buttons, headings, tooltips, page titles, and error messages ("Save transaction", "Net after Level 1 post-splits"). These keep their capitals: module names (Commission Tracker, Owner Reports, Operating Expenses), report names (Owner Summary, Agent Earnings), acronyms and brands (TMS, ID, GCI, Soleox, Google Sheets), the Level 1 / Level 2 stage names, and anything the user names in settings: field labels (Primary Agent, Closing Date), section names, commission entities, caps, and scorecards. Keep hard-coded fallbacks of those names as they are.
- On Transactions, each row starts with a thin edge in its status's scorecard color (`status-stripe` in `app/globals.css`).

### Tables & Owner Reports
Detailed filter, table, and per-report requirements for Owner/Agent/Office Reports live in `.cursor/rules/report-requirements.mdc`; read it before changing any report.

- Top navigation slides into view on hover on report pages and hides when the pointer leaves.
- Wrap wide report tables in a `.report-table` scroll container for horizontal scrolling.
- Never set `overflow: hidden` on a table wrapper.
- Table headers pin below the report filters while scrolling.
- Summary and Total rows remain pinned at the bottom of report tables.
- **Cap Progress Colors**:
  - `< 70%`: Blue
  - `70% - 90%`: Yellow
  - `90% - 100%`: Orange
  - `100%`: Green
  - `> 100%`: Red

---

## 6. Development Directives & Best Practices

1. **Strict Typing**: Write clean, production-grade TypeScript. Avoid `any` types; prefer strict interfaces and zod validations.
2. **Multi-Tenant Isolation**: Never query the database without scoping queries to the active `client_id` and passing authenticated JWTs.
3. **No Unprompted Reverts**: Keep prior functional changes intact unless explicitly instructed to revert.
4. **Focused Context**: When modifying commission calculations or waterfall formulas, restrict analysis to the commission engine files (`applyTemplateLogic.ts`, `formula-evaluator.ts`, `CommissionTemplatePanel.tsx`) without scanning unrelated modules.

---

## 7. Reference Documents
- `.cursor/rules/*.mdc`: authoritative, detailed specs (access, dev navigation, form controls, page margins, reports, unsaved save). Sections above summarize them.
- `ARCHITECTURE.md`: data dictionary, ID prefixes, waterfall sections (`OFF_THE_TOP`, `PRE_SPLIT`, `AGENT_SPLIT`, `POST_SPLIT`, `POST_SPLIT_L2`).
- `FEATURES_PIPELINE.md`: feature/requirement backlog (`FR-###`). Add new entries at the bottom of the right section; move to Done when shipped.
