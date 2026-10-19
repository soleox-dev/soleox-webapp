# Mobile usability audit

Date: 2026-10-19. Target: a 375px-wide phone, touch only, no hover, with an on-screen keyboard. This audit is read-only and no code was changed.

**Method.** The code was read for every route and shared component. In the browser pane, the sign-in page was checked at the mobile preset; it renders cleanly. Signed-in pages could not be opened from this session, so the findings for those pages come from the code. Before shipping each fix, confirm it on a real phone or on the mobile preset while signed in.

**Width budget at 375px**
- `pageFrame` (`px-4`) leaves 343px.
- Inside a `p-5`/`p-6` card that drops to about 295–303px.
- Inside a nested waterfall sub-card it is about 259px.

---

## Decisions (2026-10-19)

These override the proposals below where they differ.

- **Phone navigation:** a menu button in the header opens a sheet with the same permission-gated links, the client switch, the theme toggle and sign-out. No bottom tab bar.
- **Tiers:** accepted as proposed in section 3, except for transaction detail (next bullet).
- **Transaction detail on phones is entirely read-only.** Below `md`, render it the way it renders today for `COMMISSION_TRACKER_READ` users, whatever role the user has. That means no overview editing, waterfall editing, template submission or add-agent on phones. Reuse the existing read-only path instead of hiding controls one by one. No separate read-only Calculations view; phones show what read-only users already see.
- **Read-only agent detail:** build it (view-only sheet or card, available to every role that can see Agents).
- **Delivery:** one PR per step. The first PR makes reports usable on a phone. It covers the Phase 1 foundations (the touch variant, the `useMediaQuery` hook, the consolidated `underlineControl` with the iOS zoom fix), the phone navigation sheet, a static report header below `md`, and removing the Owner Reports locked layout and wheel-only scrolling below `md`. Then come dropdowns, modals, touch tooltips and the desktop-only notice, followed by Phases 2–4.
- **Every PR:** desktop at 1440px must stay pixel-identical (compare before and after screenshots), and the user checks phones at 375px through ngrok before merging.

---

## 0. Summary

Five facts about the current app on a phone:

1. **No app navigation below `md`.** The pill nav in `components/Navbar.tsx:158` is `hidden md:flex`. On a phone the header only offers the logo, a "Main Menu" link and the avatar menu. The Main Menu cards are the only way to move between sections.
2. **On Owner Reports the header cannot be reached at all.** It reveals only on a `mousemove` with `clientY <= 16` (`Navbar.tsx:90-95`), which touch cannot produce. Every tap's emulated mousemove hides it again.
3. **Hover-only controls are completely invisible on touch.** Tailwind v4 (`^4.3.3`) compiles `hover:` and `group-hover:` inside `@media (hover: hover)`, so they never apply on a phone. This is good for decorative hovers. It is fatal for:
   - the Owner Reports **ONLY** button
   - the transaction filter clear "x"
   - the waterfall info tooltips
4. **Two report layouts cannot scroll by touch.** Agent Earnings and Team Caps lock `html`/`body` to `overflow: hidden` and scroll only through `wheel` handlers, which touch never fires. Owner Summary does the same when the scorecards are hidden or a drilldown is open.
5. **iOS zooms on every input.** Almost every input is `text-xs` (12px) or `text-[11px]`, and iOS Safari zooms the page when a field under 16px gets focus. `OptionMenu` is a real text input, so every dropdown also pops the keyboard.

What already works:
- `/login`, `/select-client`, `/no-access`, the Main Menu and the "coming soon" stubs.
- Settings › Activity.
- Final disbursements on the transaction detail page.
- The caps field grid (`md:grid-cols-2`).
- The settings layout already stacks below `lg`.
- Next's default viewport meta (`width=device-width, initial-scale=1`) is in effect. There is no custom `viewport` export, which is fine.

---

## 1. Shared shell

### 1.1 Navbar (`components/Navbar.tsx`)

| Issue | Where | Why it breaks at 375px |
|---|---|---|
| No section nav on phones | `:158` `hidden md:flex` | Transactions, Agents, Settings and Reports cannot be reached from the header. The tracker and reports dropdowns are also hover/focus menus (`group-hover/tracker:block`, `:178`, `:224`). |
| Owner Reports header hidden | `:78-101`, `:126`, `:131-133` | The header is `fixed` plus `-translate-y-full pointer-events-none`. It opens on `mousemove` near the top, on `:hover`, or on `onFocusCapture`. None of these is reachable by touch, so the avatar menu (theme, client switch, sign-out) is also unreachable on reports. |
| Right side crowded on transaction detail | `:145-153`, `:245-257` | The row holds Logo + REBI + the "← Transactions" back link (`md:hidden`) + "Main Menu" + divider + avatar. Together that is about 340px, right at the limit. |
| Avatar menu | `:270` `w-56`, `right-0` | Fits. Items are `py-2 text-xs`, about 32px tall, which is borderline acceptable. Outside-close uses `mousedown`, which works through emulated mouse events. |

### 1.2 `lib/page-frame.ts`

`mx-auto w-full max-w-[1600px] px-4 md:px-6` is already mobile-correct, with 16px gutters. No change is needed. Pages must keep not nesting extra padding. The extra padding that phones lose comes from cards: `p-5`/`p-6` on header cards, table cards and section bodies.

### 1.3 Modals

All modals follow the same pattern: `fixed inset-0 … p-4` with a centered `w-full max-w-*` panel, plus `ModalScrollLock` (body `position: fixed`, siblings `inert`). None goes full-screen on phones.

- **No `max-h` or internal scroll, so the footer gets lost behind the keyboard:**
  - `BulkUpdateDialog.tsx:108-114`
  - `AgentPickerModal.tsx:79-80`
  - commission-entities `page.tsx:572`
  - commission-rules `:243`
  - commission-templates `page.tsx:143`
  - fields `:1944`
  - template `[id]/page.tsx:2015`, which contains a FormulaEditor
- **Uses `vh` where `dvh` is needed:**
  - Template submission modal `CommissionTemplatePanel.tsx:1535-1538` is `max-h-[calc(100vh-2rem)]`. On iOS, `100vh` is taller than the visible area, so Close/Submit can fall off-screen.
  - The same applies to `max-h-[90vh]` in the agent edit modal (agents `:1496`) and the field config modal.
- **Footers that don't wrap:** `AllocateCommissionModal.tsx:46-71` uses `flex-nowrap` with `whitespace-nowrap` buttons, so "No, record no payments" and "Yes, pay {agent}" overflow.
- **Two-column forms with no prefix:**
  - Agent edit modal `grid-cols-2` (agents `:1525`)
  - Entity modal (`:606`, `:645`)
  - Rules modal (`:269`, `:294`)
  - Field config (`:1419`, `:1449`, `:1662`, and a `grid-cols-12` rule builder at `:1547-1582`)
  - Template/logic modals `grid-cols-[7.75rem_minmax(0,1fr)]` (`[id]/page.tsx:103` and others; `LogicStepForm.tsx:161` and others)
  - All of these leave about 140–160px per field.
- **Auto-focus on open** (agent modal, agents `:378-385`) pops the keyboard immediately.
- **Already fine:**
  - `ConfirmDialog` (`max-w-md`, short)
  - `UnsavedChangesModal` (`flex-col-reverse sm:flex-row`)
  - `RequiredFieldsModal`
  - `TransferPrimaryAgentModal` (`grid-cols-1 sm:grid-cols-2`)
  - `SyncResultDialog` (`max-h-[85vh]`, scrolling body)
  - `ToastBanner`

### 1.4 `components/ui`

**`OptionMenu` (`option-menu.tsx`) and `ClearableSelect`, which wraps it.**
- It is a `type="text"` combobox that opens on focus. On a phone every dropdown therefore raises the keyboard and the iOS zoom (`text-xs`).
- The listbox is `position: fixed`, sized to the input width, `max-h-48`, with `text-xs py-1.5` items (about 28px). In 120px filter cells the list is 120px wide.
- `place()` (`:66-77`) uses `window.innerHeight`, not `visualViewport`, so with the keyboard up the list can render behind the keyboard.
- The blur handler checks `menuRef.matches(':hover')` (`:161`). On touch the hover state sticks, so the menu may not close.
- ClearableSelect clears only with Backspace/Delete and undoes with keys (`ClearableSelect.tsx:79-100`). There is no visible clear control.
- **Mobile direction:** below `md`, add `readOnly` and `inputMode="none"` unless `allowCustom`, so tapping opens the list without the keyboard. Use 16px text, and size items at 40px or more. Optionally render a bottom sheet.

**`UnderlineField` (`underline-field.tsx`).**
- `underlineControl` is `text-xs h-5 leading-4`. A closed field is about 26px tall, and iOS zooms on focus.
- The constant is **copied in four places**:
  - `components/ui/underline-field.tsx:10`
  - `commission-templates/[id]/page.tsx:87`
  - `[id]/LogicStepForm.tsx:113`
  - a local copy in `settings/fields/page.tsx` (~117)
- The agents page has its own `filterShell`/`filterControl` (agents `:72-81`), and so does transactions (`:330-333`).

**`.underline-field:hover` (`app/globals.css:259-320`).** This is plain CSS, not gated by `(hover: hover)`, so the hover fill sticks after a tap on iOS. It is cosmetic.

**`ReorderControls` (`reorder-controls.tsx:41`).** The `sm` size is `text-[8px] px-1 py-0.5` and `md` is `text-[10px]`, giving 12–16px targets. Labels exist only in `title`. On phones these are the only reorder path, because HTML5 drag-and-drop does not work on iOS.

**Smaller components.**
- `BooleanCheckbox`: the box is `h-3.5`, but the label is the hit area. OK.
- `NativeDateInput`: the triple-click and Backspace shortcuts are desktop-only and harmless.
- `ToastBanner`: OK. Its close button is `h-6 w-6`.

### 1.5 `.report-table` scroll container (`globals.css:159-177`)

- `.report-table` (`overflow-x:auto; overflow-y:clip`) already gives horizontal scroll on phones. Keep it.
- The problems sit around it:
  - The header pin is JS: `reports-client.tsx:1227-1281` writes `--report-chrome-bottom` and applies `translateY` to each `thead`. On a phone the "chrome" (title plus 4–6 rows of wrapped filters) can be 300–400px, so the pinned area takes about half the screen.
  - Footer width sync writes inline px widths (`RC:4268-4280`, `4612-4647`, `5226-5249`, `5472-5507`; `team-caps-report.tsx:195-222`).
  - `.report-table-fit thead { position: sticky; top: 0 }` combines with locked-mode `h-dvh overflow-hidden` (`RC:785-787`).
- **Mobile direction:**
  - Below `md`, don't pin the filter chrome. Collapse filters into a "Filters (n)" button.
  - Pin only `thead` to `top: 0` of the page.
  - Turn off the locked-layout `overflow: hidden` on html and body.

### 1.6 Hover-only and pointer-only behaviors (app-wide inventory)

Each item has a severity:
- **Blocker**: a feature that cannot be used on touch.
- **Info lost**: meaning that only exists in a tooltip.
- **Cosmetic**

| Behavior | Where | Severity | Mobile fix |
|---|---|---|---|
| Report pages reveal the top nav only on hover/mousemove | `Navbar.tsx:78-101,126` | Blocker | Below `md`: a normal static header, or a small tab that toggles it on tap. Needs a spec edit. |
| Filter option **ONLY** shows only on hover (`group-hover:flex`, count `group-hover:opacity-0`) | `reports-client.tsx:2156-2170` | Blocker | On `(hover: none)`, always show a small "Only" button next to the count, or use long-press. |
| Tracker and Reports dropdown menus | `Navbar.tsx:178,224` | Blocker (hidden below `md` anyway) | Mobile nav (see §5). |
| Report menu button opens on `onMouseEnter`; the closed state shows only the number, the name is in `title` | `RC:942-956` | Info lost (a click also opens it) | Show the report name under `md`. |
| Chart tooltips use only `onMouseMove`/`onMouseLeave`; a tap leaves the popup stuck | TrendChart `RC:3123-3137`, PriceBars `3264-3269`, LineChart `3364-3377`, EarningsTimeline `4073-4094` | Blocker for reading values | Pointer events with tap-to-select and tap-outside-to-clear. EarningsTimeline `onClick` depends on `hover` being set (`:4074`). |
| ScoreNote info (Date range, Group, Earnings type, Cap year, % Δ) | `RC:4915-4937` | OK (click-to-pin exists). Target is 18px. | Enlarge the hit area. |
| Transactions filter clear "x" (`opacity-0` until `group-hover/filter` or `group-focus-within`) | `transactions/page.tsx:116` | Blocker (iOS doesn't focus buttons on tap) | Always visible on `(hover: none)`. |
| `HoverNote` tooltips for icon-only toolbar buttons (bulk, Highlighter, Compact, Filters) | `HoverNote.tsx:44-51`; T `:2033,2057,2112,2129`; A `:1010,1064,1081` | Info lost; can stick open | Add visible labels under `md`, or use `aria-label` plus a tap-toggle tooltip. |
| `HoverNote` on a plain `<span>` (the "Percent deductions are calculated from…" note) | `CommissionWaterfall.tsx:1267,1468`; `CommissionWaterfallTable.tsx:498,622` | Info lost | Make it a button with tap-toggle. |
| Waterfall info tooltips `group-hover/painfo` (Primary Agent) and `group-hover/psinfo` (Level 1/2) | `CommissionWaterfall.tsx:1050-1075,1184-1209` | Info lost. They are also `w-72` inside `overflow-hidden`, so they clip. | Tap-toggle popover. |
| FormulaEditor explain bubble and hint "i" (hover/focus only; 14px target) | `FormulaEditor.tsx:351-383,405-427` | Info lost | Desktop-only tier, so this is acceptable behind the notice. |
| Settings sidebar hover flyout (3s timer) | `settings/layout.tsx:44-52,154-156` | n/a below `lg` | Phones get the stacked list (see §2.4). |
| `SplitPair` % suffix hover preview | `SplitPair.tsx:85,257-258` | Cosmetic | None. |
| Agents pinned cell `group-hover:bg-*`; sort arrows `group-hover:opacity-100` (always visible anyway) | A `:935,938`; T `:2395`; A `:1185` | Cosmetic | None. |
| `.underline-field:hover` raw CSS | `globals.css:259-320` | Cosmetic (sticky tint) | Wrap it in `@media (hover: hover)`. Desktop is unchanged because desktop has hover. |
| Information only in `title=` | TMS/bolt icons (T `:2552,2566,2572`); "changed in last sync" cell (T `:2607`); why Save/Apply is disabled (`HeaderCard.tsx:63`, `UnsavedChangesModal.tsx:64`, `CommissionWaterfall.tsx:600`); template status icon meaning (`CommissionTemplatePanel.tsx:1447-1451,1477`); team-cap calculated amount (`AgentAllocationNotes.tsx:115`); SortHead full column names (`RC:1106`); MultiFilter selected list (`RC:2134`); "Show all paid transactions" explanation (`RC:1512`); cap goal "$x of $y" (`team-caps-report.tsx:110`); fields disabled reasons (`fields/page.tsx:1269,1285,1314`); truncated entity names (`CommissionWaterfall.tsx:754` etc.) | Info lost | Per case: a visible caption, a legend, or a tap-toggle note. |
| HTML5 drag-and-drop | waterfall rule reorder (`CommissionWaterfall.tsx:469-481`), template params/logic (`[id]/page.tsx:1395,1615` and others), PostSplitOrder (`:125-131`) | Blocker on iOS | Bigger up/down buttons on phones. All three are in desktop-only or edit-only areas. |
| Pointer drag-to-select rows, which calls `preventDefault` on `pointerdown` with no `touch-action` | T `:1490-1579,2505-2519`; A `:628-685,1268` | Fights scrolling | Disable bulk mode below `md`. |
| Double-tap enters edit mode | `useEditOnDoublePress.ts:24-33`, used at `TransactionOverview.tsx:196`, `CommissionWaterfall.tsx:614` | Accidental edits | Disable below `md` for the waterfall. |
| Keyboard-only paths: Tab-accept autocomplete, Escape, Backspace-to-clear, Ctrl+Z undo | FormulaEditor `:765-790`; ClearableSelect | Missing affordance | Covered by the OptionMenu work and the desktop-only formula tier. |
| Wheel-only scrolling in locked report layouts | `RC:1200-1226,2446-2517` | Blocker | See §1.5. |

---

## 2. Routes at 375px

### 2.1 Entry pages

| Route | Status at 375px |
|---|---|
| `/login` | Works, verified in the browser pane at the mobile preset. `max-w-md px-4`, `h-12` buttons. |
| `/select-client` | Works. `max-w-lg px-4`, full-width rows. |
| `/no-access` | Works. |
| `/` (Main Menu) | Works. Header is `sm:flex-row`, cards `md:grid-cols-2`, links `sm:grid-cols-2`. Note: both `app/page.tsx` and `app/(dashboard)/page.tsx` resolve to `/`. Check which one is served; this is a possible build conflict and is out of scope here. |
| `/goals`, `/leads`, `/operating-expenses` (+ `/settings`) | 14-line "coming soon" stubs. Fine. |

### 2.2 Owner Reports (`/owner-reports/[id]`, plus the Agent and Office Reports stubs)

**Shared report chrome (`reports-client.tsx`)**
- **Title row** is `grid-cols-[1fr_auto_1fr]` (`:1285`), with a `text-3xl` h2 (`:1290`) and `whitespace-nowrap text-3xl` TitleMetric/TitleCaps (`:1671`, `:1754`). Long titles crush the report-menu button and the Cumulative button.
- **Filter bar** is `flex-wrap p-3` (`:1462`). Filters are `min-w-[9rem]` or `w-[9.5rem]`, so about 2 fit per row and the bar runs 4–6 rows. It is `sticky top-0` (`:1284`) and can cover about half of an 812px screen.
- **Filter dropdowns** are fixed `w-64`/`w-72`/`w-80`, anchored `left-0` (`:1934`, `:2019`, `:2140`, `:960`). TitleCaps is `-translate-x-1/2` (`:1759`). Any filter in the right half overflows the right edge.
- **Outside-close uses `mousedown`** (`:1653` and others). A touch scroll does not close menus.
- **Tap targets:**
  - calendar button 16px (`:1849-1863`)
  - ScoreNote 18px
  - SortHead buttons `p-0`, about 16px (`:1108-1111`)
  - Select all / Reset about 24px
  - closed underline fields about 26px
  - menu items about 28px
- **Search inputs** are `text-sm`, which triggers zoom.

**Per report**

| Report | What breaks |
|---|---|
| Cover (no id) | `text-6xl` title (`:1038`). Any tap on `main` launches (`:785`). Mostly OK. |
| owner-summary | Scorecards are a 5-track grid with no prefix (`:2596-2650`), about 95px per card. The MonthTable has 16 columns with a sticky first column (`:5259-5278`), and its height is an inline `calc(100dvh - var(--report-chrome-bottom))` (`:2664`), so about 400px is left. **When scorecards are hidden or a drilldown is open, html and body become `overflow:hidden` and scrolling is wheel-only (`:2446-2517`), which leaves touch users stuck.** The drilldown has 9–10 columns with `min-w-[12rem]`. The grain menu is a portal at fixed px. |
| lead-source-leaderboard | Panels stack (`lg:grid-cols-2`, `:1059`), but `pairedScores` is `grid-cols-3` with no prefix (`:1061`): full money in `text-xl` plus `gap-8` deltas in about 105px cards overflows. The 5-column table is fine with horizontal scroll. |
| team-performance | Same 3-column scorecards (`:3046-3055`). SVG charts use a fixed `viewBox 640×250` in `h-64 w-full`, so 11px labels render at about 5.5px (`:3091-3093`, `:3235-3237`). Tooltips are hover-only and `w-max nowrap`. |
| net-commission-income (Agent Earnings) | **Locked layout:** `h-dvh overflow-hidden` plus html/body overflow hidden plus wheel forwarding (`:785-787`, `:1200-1226`). The static chrome of 300–400px leaves about 0px for the pivot, and **nothing scrolls by touch.** The pivot has no sticky left column. With a pick, the score and chart block stacks and pushes the 11-column transaction table off-screen. |
| team-caps (`team-caps-report.tsx`) | Same locked-layout blocker. Tables are `min-w-[880px]` (`:287`) and `min-w-[960px]` (`:228`), GoalMeter is `w-[9.5rem]`, and the address column is `min-w-[14rem]`. "$x of $y" lives only in `title`. SortHead and useColumnSort are duplicated from RC (`:31-63`). |
| transaction-list / transaction-detail | DealTable has 6–8 columns with `text-sm uppercase tracking-wider` headers and up to 200 rows. It works with horizontal scroll but is heavy. |
| team-productivity, listings-by-list-date, net-commission-analysis | LineChart `viewBox 640×220` with `fontSize=10`, so labels are tiny. The 5-column tables are OK. |
| price-change, daily-management | `md:grid-cols-3` stacks. OK. |
| Not-ready reports | Show only the Unavailable box. OK. |
| `/agent-reports`, `/office-reports` | Stubs. |
| `loading-data-page.tsx` | Already responsive (`grid-cols-2 sm:grid-cols-4`). |

**Spec conflict.** `.cursor/rules/report-requirements.mdc` requires the hover nav reveal (`:17`), the ONLY-on-hover button (`:38`), the hover report menu (`:57`) and hover chart popups. Mobile fixes for these need matching spec lines such as "On touch screens, …". Keep the desktop wording.

### 2.3 Commission Tracker: lists

**`/commission-tracker/transactions` (`transactions/page.tsx`)**

- **Header card** `p-6` plus `text-2xl`, and four stacked scorecards (`grid-cols-1 md:grid-cols-2 xl:grid-cols-4`, `:1906`) before the table.
- **View tabs** (`:1954`) are a non-wrapping, non-scrolling `flex` of `whitespace-nowrap` tabs, which overflows the card. The agents version wraps (A `:976`).
- **Toolbar** wraps (`:2017`), but the search is `w-[20rem] max-w-full` in a non-wrapping row with the 36px filter button (`:2128-2146`), so it overflows by about 50px.
- **Table:**
  - `min-w-[1200px]` (`:2211`), one column per schema field, `whitespace-nowrap text-xs`, no sticky first column.
  - The scroll box is `max-h-[640px]` (`:2209`), which gives a nested scroll trap on phones.
  - The "Load next 100 / Load all" row sits inside the 1200px table (`:2689-2714`) and can be off-screen horizontally.
- **Tap targets:**
  - checkboxes `h-3.5`
  - header filter buttons `h-6`
  - bolt link about 20px
  - sort arrows are bare text
  - row actions `h-7`, or **`h-4` in Compact mode**. Compact is persisted in `localStorage` (`soleox-transactions-row-density`), so it carries to the phone.
  - search clear ✕ about 12px
- **Filter portals** are `w-64`/`w-72` with no `max-h`. The JS clamp uses `width = 256`, but the bolt panel is `w-72` (288px), so it is off by 32px (`:1274` vs `:2762`).
- **Persisted list state** (sessionStorage, `:174-212`) reopens desktop's Filters row on the phone.
- **Lookup path that works today:** search, view tabs, tapping a row (`router.push`, `:2520-2533`).

**`/commission-tracker/agents` (`agents/page.tsx`)**

- The table has no fixed min-width, but every enabled field is a `nowrap` column. It has a sticky first column, plus an 8px sticky checkbox column in bulk mode (`:932-938`), so the pinned area eats a lot of a 343px screen.
- No pagination: every agent renders.
- **There is no read-only agent detail.** Name and ID open the edit modal, and only for writers (`:1316`, `:1334`). Row tap does nothing (`:1283-1291`). For mobile "agent lookup" this is the main functional gap.
- The status badge is a tap-to-toggle **write** (`:1363-1368`) at 16–20px, easy to hit by accident while scrolling.
- The edit modal is `grid-cols-2`, auto-focuses, and uses `90vh`.

### 2.4 Commission Tracker: transaction detail (`/commission-tracker/transactions/[id]`)

- **The left sidebar ("Workflow Steps") always shows above the content on phones.** The grid is `lg:` only (`page.tsx:1775`), and the collapse controls are `hidden lg:*` (`LeftSidebar.tsx:40,65,74`). That costs about 170px of `text-[10-11px]` links.
- **HeaderCard is the biggest problem.**
  - It is `sticky top-16 z-40 p-6` with no prefix (`HeaderCard.tsx:18`). Title, badges and the search picker pin about 260–300px of an 812px screen.
  - The title row is `flex justify-between` with no wrap (`:19`). With unsaved changes, Delete + Discard + Save overflow sideways.
- **Section headers are clipped.** Each section is `overflow-hidden` with a non-wrapping `px-6` header:
  - waterfall: `CommissionWaterfall.tsx:536-610` with the template control, Reset, layout toggle, edit and collapse
  - Overview edit mode Cancel/Apply (`TransactionOverview.tsx:173-188`)
  - The collapse and edit buttons get cut off.
- **Overview read mode works.** It is single-column (`lg:` grid, `:202`). Values are `truncate` with no way to see the full text.
- **Waterfall table mode** (the default, persisted in localStorage, `CommissionWaterfall.tsx:244-256`):
  - one sticky label column plus `min-w-[14.5rem]` per agent (`CommissionWaterfallTable.tsx:194,480`), so even one agent scrolls sideways
  - pills `text-[9px]`
- **Waterfall cards mode:**
  - agent cards stack (`sm:flex-row`)
  - rule rows are no-wrap `flex justify-between` (`:717`, `:882`, `:1362`, `:1428`)
  - the read-only SplitPair is about 210px (`SplitPair.tsx:67-68`), which leaves about 50px for the entity name
  - that name has `max-w-[190px]`, and its parent has no `min-w-0`, so the row overflows
- **Final disbursements** is already `grid-cols-1 md:grid-cols-2`. Fine.
- **Calculations** are only reachable inside the template submission modal, and only for writers (`CommissionTemplatePanel.tsx:1660-1716`; panel gated at `CommissionWaterfall.tsx:546`). Read-only users never see them.
- **Editing:**
  - Overview editing is a single column, so it is feasible.
  - Waterfall editing is too dense: the editable SplitPair is about 230px in a 259px row, plus reorder, trash and an entity select. Reorder uses HTML5 drag with a 12px ▲▼ fallback.
  - `DecimalInput` has no `inputMode` (`DecimalInput.tsx:138`), so phones show the full keyboard.
  - Double-tap enters edit mode.
- **Scroll-spy** uses a hard-coded 120px offset (`page.tsx:151`), and hash scroll treats `top < 80` as done (`:217`). Both are wrong when the phone header is 260px or more.
- **Dead code:** `components/CommissionWaterfallLedger.tsx` and `components/DynamicTransactionForm.tsx` are not imported anywhere.

### 2.5 Commission Tracker: settings

**Layout (`settings/layout.tsx`)**
- Below `lg` the full menu card (9 links, about 420px) is stacked above every settings page (`:151-153`).
- The hover flyout and icon rail are `lg:` only.
- A phone needs a compact menu (a select or a "Settings ▾" disclosure) rather than class tweaks.

| Route | Read/write | What breaks at 375px |
|---|---|---|
| `settings` (index) | nav | Same stacked menu. |
| `activity` | read-only | Nothing. A `ul` with `flex-wrap` rows. |
| `caps` (Team Cap / Agent Cap) | editing | The field grid stacks (`md:grid-cols-2`, `:497`, `:589`) and help text is inline, which is good. The top bar (tabs + Save, `:287-306`) is about 310px in about 303px, so it needs `flex-wrap`. Cards are `p-5`. The trash button is about 26px (`:388`); "Add team cap" is about 28px (`:356`). **It embeds `FormulaEditor fitContent` (`:538`)**, which brings the 380px Functions panel off-screen, hover-only hints, Tab autocomplete and a 12px mono textarea. |
| `team-caps` | redirect | Goes to caps. |
| `agent-allocations` | light editing | `md:grid-cols-2` stacks. The same FormulaEditor `fitContent` dependency applies (`:148`). |
| `agents` | redirect | Goes to `/commission-tracker/agents`. |
| `commission-entities` (+ `PostSplitOrder`) | editing | The header already uses `sm:` stacking. The table has 7 columns plus actions and scrolls sideways. The modal is `grid-cols-2` with no `max-h`. PostSplitOrder uses HTML5 drag with 9px arrow fallbacks (`:125-138`). |
| `commission-rules` | editing | Not in the nav. The header doesn't wrap (`:144`). The modal is `grid-cols-2`. |
| `lists` | editing | Not in the nav. The header doesn't wrap (`:64`). |
| `commission-templates` (list) | light editing | Rows `flex justify-between`. OK. The new-template modal has no `max-h`. |
| `commission-templates/[id]` + `LogicStepForm` | heavy editing | The parameter table has 8 columns with two `min-w-[18rem]` cells, over 900px wide. It sits in a nested `max-h-[calc(100vh-7rem)]` scroller with a sticky header and a sticky right action column (about 150px). The logic table has `min-w-[12rem]`×3 + `[16rem]`. Reorder is drag-and-drop with 12px fallbacks. The modals use a `7.75rem` label grid, and FormulaEditor `fieldsAside` adds a `w-[32rem] shrink-0` side card, which forces about 512px of sideways scroll. |
| `FormulaEditor` | heavy editing | The Functions panel is `fixed w-[380px]` with `left = innerWidth − 388`, which is **−13px at 375px** (`:76-77`, `:121`). The explain bubble and hint are hover/focus only. Autocomplete accepts with Tab and moves with arrows. A transparent textarea over a `<pre>`, `font-mono text-xs`, zooms on iOS and hides the caret position. Buttons are about 18px tall. |
| `fields` | heavy editing | There are no responsive prefixes. The top bar (two tabs + "+ Add Field Config") is about 450px. Field rows are no-wrap with about 250px of controls on the right. The config modal uses `grid-cols-2` and a `grid-cols-12` rule builder. Disabled reasons exist only in `title`. |
| `integrations` (Google Sheet / TMS sync) | editing / admin | The header wraps. The table is `min-w-[720px]` and scrolls. The policy dropdown portal is sized by JS. |
| `scorecards` | editing | The metric grid is `sm:` responsive. The card header row doesn't wrap: the name input has an inline width up to 32ch, plus a swatch and 4 buttons, so it overflows. The sticky header uses `top-6` and slides under the `h-16` navbar (`:216`). |
| `transaction-view` | editing | `flex-wrap` throughout, `h-8` buttons. Mostly OK. |

---

## 3. Proposed tiers

**Tier definitions**
- **Mobile-first:** designed for the phone and fully usable there.
- **Usable on mobile:** reads well; editing is optional or limited.
- **Desktop-only with notice:** below `md`, show a short notice ("This screen needs a larger display") with a link back. Desktop is unchanged.

| Page | Proposed tier | Changes from the brief |
|---|---|---|
| `/login`, `/select-client`, `/no-access`, Main Menu | Mobile-first (already done) | None. |
| Owner Reports: owner-summary, leaderboards, team-performance, team-caps, agent earnings, transaction list/detail, price-change, daily-management | **Mobile-first** | team-caps and agent earnings need the locked-layout fix before anything else. Very wide pivots (16-column month table, daily pivot) stay horizontal-scroll tables with a sticky first column rather than becoming cards. |
| Transactions list: search, view, open | **Mobile-first** (lookup) | Bulk mode, drag-select, Sync with TMS, delete/restore: hide below `md` (desktop-only). |
| Agents list: search, view | **Mobile-first** (lookup) | **Needs a read-only agent detail** (sheet or card), because today only writers can open an agent, and only into the edit modal. Hide the status toggle, bulk and delete below `md`. |
| Caps settings (`settings/caps`) | **Usable on mobile** for viewing and simple edits. Formula fields are desktop-only. | Downgraded from mobile-first: every cap embeds FormulaEditor, which is desktop-only in its current form. Option: show the formula read-only on phones with an "Edit on desktop" hint, and keep numeric and checkbox fields editable. **Cap progress** (the thing people check on a phone) lives in the Owner Reports team-caps report, which is mobile-first. |
| Transaction detail: overview, payments, read-only waterfall | **Usable on mobile** | Force the cards layout below `md`. Overview editing is allowed. **Waterfall editing, template submission and add-agent: desktop-only on phones.** Calculations need a read-only entry point if phones should see them. |
| Settings › Activity | **Usable on mobile** | Upgraded from desktop-only: it is read-only and already fits. |
| Settings › transaction-view, scorecards, integrations (view), commission-entities (view), templates list | Usable on mobile | Small wrap fixes. Drag reorder and the integrations sync stay desktop-only. |
| Settings › agent-allocations | Usable on mobile (same as caps) | Depends on FormulaEditor. |
| Template settings (`commission-templates/[id]`), LogicStepForm, FormulaEditor, fields, commission-rules, lists | **Desktop-only with notice** | Confirmed by the code: tables over 900px wide, side-card formula editor, drag-and-drop, keyboard autocomplete. |
| Bulk sync (Transactions "Sync with TMS", Integrations sync, bulk update/delete) | **Desktop-only** (hide the controls; no full-page notice) | These are controls inside mobile-first pages, so hide the buttons below `md` instead of blocking the page. Keep `SyncResultDialog` viewing available. |
| Goals, Leads, Operating Expenses, Agent/Office Reports | No action (stubs) | None. |

---

## 4. Technique: leaving desktop unchanged

**The rule.** Today's classes become the `md:` (or `lg:`) values. Only the unprefixed base classes change. Example: `sticky top-16 p-6` → `p-4 md:sticky md:top-16 md:p-6`. Because every desktop value moves to a prefixed copy, desktop rendering at ≥ 768px is identical by construction.

Two complements to that rule:
- **Touch-only behavior goes behind capability queries, not width.** Use a custom Tailwind variant such as `@custom-variant touch (@media (hover: none) and (pointer: coarse))` or Tailwind's `pointer-coarse:`. Example: show the ONLY button and the filter clear "x" with `touch:flex` / `touch:opacity-100`. Desktop mice never match, so desktop is unchanged even on a narrow window.
- **Wrap ungated hover CSS** in `globals.css` (`.underline-field:hover`) in `@media (hover: hover)`. Desktop has hover, so nothing changes there.

**Where class-only changes are hard**

1. **JS-computed geometry.** These need a `useMediaQuery('(min-width: 768px)')` hook, or similar, so the code branches only when it is false:
   - Report header pin `translateY` and `--report-chrome-bottom` (`RC:1227-1281`)
   - footer px-width sync (5 places plus team-caps)
   - menu placement constants (`width = 256`, `380`, `innerWidth − 388/304`)
   - OptionMenu and HoverNote placement
   - scroll-spy offsets (`page.tsx:151,217`)
   - cap-bar width sync (`AgentAllocationNotes.tsx:144-151`)
   - FitText/FitVolume probes, which are fine as is
2. **Behavior chosen by report id, not breakpoint.** The locked layout (`RC:785-787,1198-1226,2490-2517`) toggles `overflow:hidden` on html and body and forwards wheel events. Gate the lock on the same media query.
3. **SVG chart constants.** `viewBox 640×250/220` and `fontSize` attributes are not classes. Phones need a different viewBox or larger font attributes, chosen in JS.
4. **Conditionally built class strings and shared constants.**
   - `compactRows ? … : …` (transactions and agents). Compact mode should be ignored below `md`, or its small sizes moved under `md:`.
   - `pinLeft` `left-0`/`left-8`
   - `pairedScores`, `reportTableWrap`, `SortHead widthClass`, `earningHead`
   - `underlineControl` copied in 4 files, plus `filterControl` in 2. The iOS zoom fix (`text-base md:text-xs`, with `h-5 leading-4` → `md:` too) must land in every copy. Consolidating them first is worth it.
5. **New markup, not class changes.** Each of these needs an added `md:hidden` element next to the existing `hidden md:*` one:
   - mobile nav (drawer or bottom bar)
   - settings menu as a select or disclosure
   - transaction and agent card lists (`hidden md:table` plus an `md:hidden` list reusing `renderCellContent`)
   - "Filters (n)" collapsible on reports
   - the desktop-only notice
   - the read-only agent detail
6. **`colSpan` math** (T `:2476,2482,2692`; A `:1251,1257`). Hiding columns with CSS breaks the spans. Prefer the separate card list.
7. **Protected styles.** The waterfall SplitPair widths come from JS ternaries (`SplitPair.tsx:67-68,180`), and CLAUDE.md protects their compact styling. Since waterfall editing is desktop-only on phones, only the read-only SplitPair needs a base/`md:` split.
8. **State persisted from desktop.** Waterfall layout and Compact density live in localStorage; Filters-open lives in sessionStorage. Phones should ignore these, or keep a separate key, so a desktop choice does not break the phone view.
9. **Inline styles.** These need `max-w-full` or `min-w-0` overrides or a JS branch:
   - Scorecard name input width in `ch` (`scorecards/page.tsx`)
   - OwnerSummary `maxHeight` calc (`RC:2664`)
   - tooltip and portal `style={{top,left}}`
10. **Specs.** `report-requirements.mdc` and `form-controls.mdc` describe hover-driven behavior. Add a touch clause to each rule rather than rewriting the desktop text.

---

## 5. Implementation order

Each step is shippable on its own and leaves desktop pixel-identical. Before merging each step, verify desktop at 1440px and phones at 375px.

**Phase 1: shared shell**
1. **Foundations.**
   - Add the `touch` custom variant (or adopt `pointer-coarse:`) and a `useIsDesktop()` / `useMediaQuery` hook in `lib/`.
   - Gate `.underline-field:hover` behind `@media (hover: hover)`.
   - Consolidate the four `underlineControl` copies and the two `filterControl` copies, then set base `text-base` with `md:text-xs` (this stops the iOS zoom app-wide).
2. **Navbar.**
   - Add a phone nav below `md`: a menu button opening a sheet with the same permission-gated links (Transactions, Agents, Settings, Owner Reports), the client switch, the theme and sign-out.
   - On Owner Reports below `md`, keep the header static (not the hover-reveal bar). Gate the `mousemove` listener on the media query.
   - Update `report-requirements.mdc` with the touch clause.
3. **OptionMenu / ClearableSelect.**
   - No keyboard on tap when `!allowCustom` (`readOnly` + `inputMode="none"` on touch).
   - 40px items.
   - Placement using `visualViewport`.
   - Close on `pointerdown` instead of `:hover` checks.
   - Optional bottom sheet below `md`.
   - This fixes every dropdown at once.
4. **Modals.**
   - A shared panel class: below `md`, full-height (`h-dvh`) or `max-h-[calc(100dvh-2rem)] overflow-y-auto`, with a sticky footer. Keep `md:` at today's values.
   - Fix the footer wrap in `AllocateCommissionModal`.
   - Use `md:grid-cols-2` for two-column forms.
   - Replace `vh` with `dvh`.
5. **Touch tooltips.**
   - Give `HoverNote` a tap-toggle mode on `touch` and allow it on non-focusable children.
   - Turn the waterfall `group-hover` info boxes into tap popovers.
   - Show the ONLY button and the filter clear "x" on `touch`.
6. **Desktop-only notice component.** A small `<DesktopOnly>` wrapper that renders children at `md` and above and the notice below. Apply it to templates `[id]`, fields, commission-rules and lists.

**Phase 2: mobile-first pages**

7. **Owner Reports.**
   - Remove the locked layout and wheel-only scrolling below `md` (the blocker).
   - Add a collapsible "Filters (n)" chrome that is not pinned below `md`.
   - Clamp dropdowns to the viewport.
   - Use `grid-cols-1 sm:grid-cols-3`-style scorecards (keeping `md:` at today's values).
   - Larger SVG fonts on phones.
   - Tap-to-select charts.
   - Then go report by report: owner-summary, team-caps, agent earnings, leaderboard, team-performance, then the rest.
8. **Transactions list.**
   - Scrollable view tabs.
   - Fix the search width.
   - Add an `md:hidden` card list (ID, address, status, closing date, agent, GCI).
   - Hide bulk, drag-select, Sync with TMS and delete below `md`.
   - Ignore Compact and the persisted Filters state on phones.
9. **Agents list.** Same card list, plus a new **read-only agent detail sheet**. Hide the status toggle, bulk and delete below `md`.

**Phase 3: usable on mobile**

10. **Transaction detail.**
    - A non-sticky, compact HeaderCard below `md` with a wrapping action row.
    - The sidebar becomes a horizontal step chip row or a collapsible.
    - Wrapping section headers.
    - Force the cards layout below `md`.
    - Read-only SplitPair rows wrap with `min-w-0`.
    - Hide waterfall edit and add-agent and disable double-tap edit below `md`.
    - `inputMode="decimal"`.
    - Correct the scroll-spy offsets.
    - Decide whether phones get a read-only Calculations view.
11. **Settings.**
    - Settings menu as a select or disclosure below `lg`.
    - Caps and agent-allocations: wrap the top bar, larger trash and add targets, a read-only formula on phones with an "Edit on desktop" hint.
    - Small wrap fixes on scorecards, entities, transaction-view and integrations.
    - Hide drag reorder below `md`.

**Phase 4: polish**

12. Visible replacements for `title=`-only information (TMS and bolt legends, disabled-Save reasons, template status icons, full column names). Tap targets of 40px or more for remaining icon buttons. A real-device pass on iOS Safari and Android Chrome.

---

## Follow-ups noticed (out of scope)

- `app/page.tsx` and `app/(dashboard)/page.tsx` both map to `/`. Confirm which one is served and remove the other.
- `components/CommissionWaterfallLedger.tsx` and `components/DynamicTransactionForm.tsx` appear unused.
- The transactions bolt filter menu clamps with `width = 256` but renders `w-72` (288px). This is a desktop edge bug too.
- `save-leave-guard.tsx`: the `popstate` guard fights the iOS edge-swipe back gesture, and `beforeunload` is unreliable on iOS. Re-test during Phase 1.
