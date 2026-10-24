# Commission Model Redesign

Status: proposal for review (2026-10-24). Nothing is built yet. The system is not live, so saved test data can be
rewritten and TATH re-uploaded.

## 1. Why

The model grew in layers (templates first; then team caps, agent caps and Commission Plans), so some ideas live in
more than one place:

- **Post-splits** exist in templates (Level 1 and Level 2 rules) and in plans (plan lines). On a plan deal both can
  charge the same entity; the app has to warn about double charges.
- **Caps** exist three times: Settings > Caps (agent caps: progress against an amount in an agent field; the charge
  itself comes from a template formula), Team Caps / Agent Allocations, and capped plan lines.
- **Fixed stages:** two deal deduction stages (Off-the-Top, Pre-Split) and two post-split levels. Most clients use one
  of each; a client needing a third has nowhere to put it.
- **Deal-specific charges** (client credits, TC fees) have no clear place relative to the plan. Migration 066 started
  this (template credits paid by chosen agents before their plan, split or equal shares).
- **Two engines:** `lib/commission-engine` (every screen) and the older `lib/services/waterfall-service.ts`, still run
  by `lib/transactions.ts` when a deal is saved with a template but no lines.

## 2. Concepts

One job per concept:

| Concept | Answers | Holds |
|---|---|---|
| **Deal Template** | How is this deal's commission divided? | Parameters filled per deal, Off the Top deductions, agent splits, bonuses, and adjustments |
| **Team Cap** | How much of a team member's split goes to the team lead(s), until the member caps? | The members' team percent and cap, the recipients (by payout rule), and the qualifying formula |
| **Commission Plan** | What does this agent pay from their split, deal after deal? | Standing lines: fees, percents, stock, caps, with levels |
| **Adjustment** | What does this one deal add? | A line with a Stage, who pays it, how it divides, and a payee |
| **Payee** | Who receives a line? | Entities, agents, and the client (for credits) |

- **What users see: the Deal Template is the whole calculation.** Its editor has one section per stage, in engine
  order, with Team Caps and Commission Plans as sections inside it (section 7). Users learn one concept; underneath,
  caps and plans are still defined once and shared, because caps track an agent across every deal and a plan belongs
  to the agent.
- **Team Caps and Commission Plans are optional.** A client without plans gets its standing post-splits from template
  adjustment rules ("Company 20%, all agents"), shown as one **Post-Splits** stage; "Before Plan" / "After Plan"
  appear only when plans exist. A client without team caps never sees them. A simple client sees Off the Top, Agent
  Splits, Post-Splits and Net Payout, close to the legacy system.
- **Templates keep everything deal-specific:** parameters, splits, bonuses, deductions, adjustments, and which team
  caps and whether plans apply.

### Every result stays editable

The right template submission should produce the exact numbers, but real deals have exceptions and errors outside
the system. So after a submission, every number in the waterfall can still be changed by hand on that deal: any
split, team cap amount, plan line, adjustment, or deduction, plus adding or removing a line.

- A typed number wins, shows **Edited** with what the calculation gave, and the lines after it recalculate from it
  with their own logic, not as fixed numbers. Plan lines keep the plan's logic: typing the company dollar line
  changes the share past the cap, so the post-cap fee and the stock base below it follow the plan's rules (as today).
  The same holds for template rules and team caps.
- Typed plan and team cap amounts count toward caps as typed (as plan lines do today).
- Each edited number can go back to its calculated value.
- Today a typed split lasts until the template is submitted again; that rule carries over to every edited number,
  and the template popup warns before a resubmit replaces them.

## 3. Engine order

Fixed, the same on every deal. Empty stages are hidden on screen.

1. **Off the Top**: comes off the whole deal (referrals, deal-level credits). Has levels.
2. **Agent Splits**: each agent's share, then team caps (part of a member's split moves to the team lead), then
   bonuses that move dollars between agents. Team caps act here, before any plan, because the lead's share then pays
   the lead's own plan (as the engine does today).
3. **Before Plan**: adjustments that come off the paying agents' splits before their plan.
4. **Commission Plan**: each agent's plan lines. Has levels.
5. **After Plan**: adjustments that come off the paying agents' net after their plan.
6. **Net Payout**.

**Levels** (stages 1 and 4): every percent in a level takes the same base. Level 1 uses the stage's starting amount
(Total Commission for Off the Top, the agent's split after Before Plan for the plan); Level N uses the net after
Level N−1. This is today's Level 1/2 behavior, with no fixed limit. With one level, no level chips or subtotals show.
"Add Level" creates the next one.

**Before Plan amounts** reduce what plan percents apply to and count against the agent's caps.

## 4. Adjustments

A deal-specific line, created by a template rule (from its parameters) or typed on the deal in the waterfall editor.

| Setting | Options |
|---|---|
| **Stage** | Off the Top (Level N), Before Plan, After Plan |
| **Paid By** | Whole deal (Off the Top only), all agents, chosen agents |
| **Divided** | By split share, equally, by custom percents, or by typed amounts per agent |
| **Share basis** (by split share) | The agents' amounts at an earlier point: after splits (2), after Before Plan lines above it (3), after the plan (4), after After Plan lines above it (5). Only points before the adjustment are offered; a later one would be circular. |
| **Amount** | Dollars, or a percent of the stage's base: the agent's split before the plan; the agent's net after the plan after it |
| **Payee** | Entity, agent, or client |

Examples: TC Fee is After Plan, paid by the agent(s) the template's "TC Fee Paid By" names. A client credit is any of
four: Off the Top (whole deal); Before Plan or After Plan; paid by all agents or chosen ones.

## 5. Commission Plans

Unchanged: ordered lines (capped percent, per-deal fee, percent of net, formula), versions by effective date, opt-ins,
Fee Share, typed amounts (Edited), waivers, year-to-date history by line key.

Changed:

- **Levels:** each line has a level; its percent base follows from it (section 3). A percent-of-net line becomes a
  percent line in a later level; its "take off first" list goes away. A custom base stays possible with a formula
  line (`line_<key>`).
- **Caps are a setting on a line:** cap amount, period (Cap Year Start or a reset field), per-agent override. This
  replaces Settings > Caps (agent caps) and gives every capped line a progress bar.
- **Applies When:** an optional condition on deal fields ("Side is not Tenant"), so broker review on leases is not
  charged without a manual waiver. Per-deal waivers stay for exceptions.
- **Payees** can be entities or agents.

Sales Volume Assignment (who gets volume credit) is not money; it stays as its own setting.

**Team Caps** stay their own concept (stage 2), as today: per cap, the members' team percent and cap amount (agent
fields, or later per-agent settings on the cap), the reset date, the recipients by payout rule, the qualifying
formula, and the box in the template popup that turns one on or off for a deal. Per-deal amount overrides stay. They
move out of "Agent Allocations" into the template editor's Team Caps section.

eXp under this model: Off the Top L1: referral. Agent Splits: team split, then the team lead bonus. Plan L1: 20%
company dollar (capped), post-cap fee, risk management (capped), broker review (Applies When: not a lease). Plan L2:
stock 5% (opt-in). After Plan: TC fee.

## 6. Data model

- **`transaction_commission_items`:** `section` becomes `stage` (`OFF_THE_TOP`, `AGENT_SPLIT`, `BEFORE_PLAN`, `PLAN`,
  `AFTER_PLAN`) plus `level` (int, default 1) and the adjustment fields (`paid_by`, `divided_by`, `share_basis`). Plan
  lines keep `plan_line_key` and `commission_plan_version_id`.
- **`commission_template_rules`:** same `stage` / `level` / adjustment fields; template post-split rules are removed
  (moved into plans).
- **Plan versions' lines:** add `level`, cap settings, `applies_when`, payee kind.
- **`client_caps`:** agent caps (`cap_type = 'AGENT'`) become line caps in plans; team caps stay (stage 2), with
  `transaction_agent_allocations` holding each deal's team cap amounts.
- **Retire** `lib/services/waterfall-service.ts` and `app/api/waterfall/calculate`.

## 7. Screens

- **Settings > Commission:** Templates and Payees (plus Volume Credit). Each agent's plan is assigned on the agent
  (Agents page, Bulk Update).
- **Deal Template editor:** one page holding every stage in engine order: Off the Top; Agent Splits, with Team Caps
  inside; Before Plan; Commission Plans; After Plan; Net Payout. A section the client does not use is hidden. Each
  rule picks its stage (and level, paid by, divided, share basis where they apply).
- **Shared sections:** Team Caps and Commission Plans are edited in place in the template but are shared, so the
  section says where else they are used ("Used by 3 templates · 12 agents") before a change is saved.
- **Plan section:** lines grouped by level, with cap and Applies When per line.
- **Waterfall:** Off the Top, Agent Splits, Before Plan, Commission Plan, After Plan, Net Payout. "Add Adjustment" in
  the editor offers the same settings as a template rule.

## 8. Migration and checks

- One migration rewrites test data: sections to stages and levels, template post-split rules into plans, caps and
  team caps into plan lines. TATH can be re-uploaded instead.
- Golden tests (`npm test`) are rebased to the new structure; every payout must stay the same to the cent. A diff
  report lists any deal whose amounts move.

## 9. Order of work

1. Engine: stages, levels, adjustments, plan levels and line caps, behind the golden tests.
2. Data: migration, saving and loading lines, retire the old engine.
3. Settings: one template editor holding every stage (adjustments, Team Caps and Commission Plans sections).
4. Waterfall and Payments screens.
5. Reports that read sections or caps (Owner Reports snapshot, team cap and plan cap reports).

## 10. Decided

- A charge that comes with a template on every deal (say a $500 marketing fee on every "Luxury Listing" deal) is a
  template adjustment rule; nothing else is needed.
- Off the Top keeps levels: clients without caps can show their brokerage split as a percent of the deal after
  referrals and credits (Level 1: referrals and credits; Level 2: the brokerage split).

- Names: Commission Template becomes **Deal Template**; deal-specific lines are **Adjustments**; the stages around
  the plan are **Before Plan** / **After Plan** (one **Post-Splits** stage without plans); Off-the-Top and Pre-Split
  become **Off the Top** with levels; Commission Entities become **Payees**; Sales Volume Assignment becomes
  **Volume Credit**. Team Caps, Commission Plans, Agent Splits, Net Payout and Levels keep their names.

## 11. Multi-industry readiness

Every part of this rebuild follows "Multi-Industry Readiness" in `CLAUDE.md` (section 7): a neutral core, a
configured commission base, many commission events per deal, negative amounts, plan conditions, presets, source
adapters, one money/date formatter, reports as a module, centralized core nouns.

## 12. Open questions

None. Next: review the whole document, then start with step 1 of section 9.
