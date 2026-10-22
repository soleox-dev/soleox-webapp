# Commission engine

Pure functions, with no React and no fetch, safe on the server. The input is the deal, its template (rules and
parameters), team caps and sales volume, the commission ledger, typed overrides and lookup tables. The output is
commission lines, team cap and sales volume allocations, payments, and an explanation for each number.

| File | What it does |
| --- | --- |
| `deal.ts` | `computeDealCommission`: the one entry point. Every screen calls it. |
| `waterfall.ts` | `computeTransactionWaterfall`: Total Commission, deductions, splits, caps, template replay, post-splits, payouts, `explanation`. |
| `template.ts` | `applyTemplateLogic`: runs a template's rules in step order. Also ledger labelling and lookup rows. |
| `stored-lines.ts` | Reads the waterfall back from saved `transaction_commission_items`; works out the primary agent. |
| `submit.ts` | `waterfallAfterTemplate`: the waterfall a submitted template produces. Also `formulaParameters`. |
| `allocation.ts` | Builds the team cap and sales volume input (`DealAllocationContext`) from API rows. |
| `save.ts` | Builds the save payload (lines, payments, allocation rows) and reports why Save is blocked. |
| `drift.ts` | Checks whether resubmitting the template would change payments (`templatePaymentsChanged`). |
| `../agent-allocations.ts` | Team cap and sales volume math (`planDealAllocations`, `qualifyingTeamCaps`). |

Browser loading and caching stay outside the engine: `transactions/[id]/components/applyTemplateLogic.ts`
(templates, ledger, lookups), `lib/template-payment-drift.ts` (caps catalog, history, overrides), and the
`useAgentAllocationInput` and `useSubmittedTemplateReplay` hooks.

Callers: Transaction Detail (`page.tsx`), the Commission Template popup (`CommissionTemplatePanel.tsx`: it submits
with `applyTemplateLogic`, the page applies the result with `waterfallAfterTemplate`, and its template button runs
`templatePaymentsChanged`), and the Transactions list's out-of-date payments check (`templatePaymentsChanged`). The
hourly sync (`lib/transaction-sync.ts`) imports deals and computes no splits.

## Which value wins

These rules describe today's behavior. The golden tests in `tests/engine` hold it in place.

1. **Saved lines set up the waterfall.** On load, the deal's saved commission lines decide the agents, their
   order (primary agent first), each split's type and value, and the deductions and post-splits
   (`waterfallFromCommissionItems`). Transaction Detail reads the lines from `/api/transactions/[id]/items`, which
   does not return `custom_attributes`, so a saved `manual_split` flag is not seen there (see Known differences).
   The template button and the Transactions list do read it.
2. **Dollars are recalculated, not read back.** `computeTransactionWaterfall` works out each amount again from the
   type and value.
   - Total Commission comes from its formula in Settings first. Otherwise it is the value typed on the
     Overview, then the deal's saved total, then gross commission. Zero or less falls back to gross.
   - Off-the-top is taken from Total Commission. Pre-splits are taken from what is left after off-the-top.
   - Agent splits share what is left after pre-splits, in list order, each cut to what remains. The primary agent
     (the deal's agent, or the step 1 split) gets the remainder.
3. **Team caps and sales volume use those splits.** A cap's choice on the template submission (`__team_cap_ids`,
   `selectedTeamCapIds`) wins. A checked cap applies even if it does not qualify, and an unchecked one does not
   apply even if it does. With no recorded choice, the caps whose qualifying formula is true apply. A formula that
   cannot be calculated, for example because a lookup table is missing, does not qualify. An amount typed on the
   deal (an override) wins over the calculated cap amount.
4. **The template replay applies only after a cap has moved money.** When a team cap moved money and the
   submitted template has loaded, the template runs again with the cap credits:
   - An agent the replay lists gets the replay's dollars.
   - A cap recipient the template does not list gets the cap total.
   - Post-splits take the replay's type and value (matched by entity). Replay post-splits with no saved
     counterpart are added.
   - When no cap moved money, the saved lines stand as recalculated in step 2.
5. **A hand-typed split beats the template.** A split typed in the waterfall (`manualSplit`, saved as
   `custom_attributes.manual_split`) is never replaced by the replay. With any typed split, the primary agent gets
   the pool minus every other split as it stands after the replay and the caps. The splits still add up to the
   pool.
6. **Saved splits fill the gap while the replay loads.** On the saved, unedited waterfall, if a cap moved money
   but the replay is not ready yet (it needs the whole ledger), each agent shows their saved split after caps
   (`storedAgentSplits`). The replay replaces these when it arrives.
7. **Submitting a template replaces the waterfall.** The popup runs the template on the deal's current agents
   and Total Commission. `waterfallAfterTemplate` then orders the agents by the template's agent splits. Cap
   recipients the submission checked are added at 0% when the template does not list them. Agents the template
   does not mention are dropped. Typed splits are cleared, so the template's numbers apply again.
8. **Save is blocked** when agent splits exceed the pool, or when a template applies and payments fall short of
   Total Commission. It is also blocked when a team cap recipient's split is less than what the caps move to
   them (money the recipient pays into their own cap does not count).

Every agent split, deduction, cap line, post-split and payout carries an `explanation` entry with its source, for
example `typed`, `remainder`, `template`, `cap-receipt` or `saved-after-caps` for splits.

## Known differences kept on purpose

These were found while unifying the code. They are kept so the numbers stay the same, and each could be aligned
in its own change:

- **Typed splits after reload.** Transaction Detail does not see a saved `manual_split` after a reload, because
  `/api/transactions/[id]/items` does not select `custom_attributes`. Once the template replays, a split typed
  and saved earlier shows the template's figure again. The out-of-date check reads the flag, so the template
  button can disagree with the page.
- **Agents the template omits.** The out-of-date check keeps the saved agents a template does not mention
  (`keepPreviousAgents`). A real resubmit from the popup drops them.
- **Allocation inputs per caller.** The page reads units from the column or a custom field and the closing day
  from its first 10 characters. It builds cap profiles for the deal's agents only. The replay checks read the
  `units` column only, need a full date, and build profiles for every agent.
