# Soleox REBI: Features and Requirements Pipeline

Features and requirements to build in the web app. Each entry says what is needed, why, and where it came from, so nothing falls through the cracks. Add new entries at the bottom of the right section. Move an entry to Done when it ships.

Status values: Proposed, Planned, In progress, Done.

## Transactions

### FR-001: Highlight transactions whose agent is Released
- **Status:** Proposed
- **Source:** TATH data import, October 17, 2026
- **Requirement:** In the default view of the Transactions table, highlight every transaction that lists a Released agent. This covers the primary agent and any agent on the commission lines.
- **Why:** TATH has transactions in Active or Pending status whose primary agent is Released (Mia Lesseos, Rachel Smith). They were imported as they are in the source data. The team needs to see them and decide whether each agent should be Active.
- **Notes:**
  - The highlight needs a way to tell what it means, such as a tooltip or legend.
  - Do not change the agent status automatically.

## Agents and caps

### FR-002: Flag agents whose cap has an amount but no cap date
- **Status:** Proposed
- **Source:** TATH data import, October 17, 2026
- **Requirement:** Flag every agent who has a cap amount (Company Comm Cap, eXp 250 Fee Cap or Liability Cap) but no cap reset date (`eXp Cap Date`). Show the flag on the Agents page and in the Caps report.
- **Why:** An agent with no reset date cannot have a cap year, so the Caps report cannot measure that agent. TATH has 13 agents with a cap amount and no date, and 56 agents with no cap date at all. They were imported as they are.
- **Notes:**
  - Agents with no cap date and no cap amount do not need a flag.
  - The flag should link to the agent so the date can be filled in.

### FR-006: Team caps that pay several agents by payout rule
- **Status:** Built; migration 075 run, waiting on migration 078
- **Source:** TATH team caps, October 23, 2026
- **Requirement:** A team cap can pay several agents, each a share of what it collects, and its payout rules can pay different agents depending on the deal. TATH uses one Team Cap: on deals of Las Vegas agents it pays Dylan 50%, Yvonne Khoo 35% and Paul Patane 15%, and on all other deals Dylan 100%. A team cap can also count toward another cap (Counts Toward, shown with two or more team caps), so what an agent paid into either one counts toward one yearly cap amount.
- **Why:** TATH's agents have one cap (20% up to $12,000) that differs only in who receives the money. Three single-recipient caps gave each agent three cap totals that had to be kept in proportion by hand. With one cap, an agent who changes region keeps one cap total.
- **Notes:**
  - Stored in `client_caps.payout_rules` (jsonb, migration 078) and `client_caps.progress_cap_id`. `recipients` and `recipient_agent_id` keep the first rule's recipients.
  - A deal uses the first rule whose condition is true or blank; a deal no rule matches pays no one.
  - The matching rule's recipients do not pay into the cap. Without a recorded choice, a cap applies only when every one of them is on the agent splits.
  - Cents left over by rounding go to the first recipient.

## Data quality

### FR-003: Validate GCI percent by client type
- **Status:** Proposed
- **Source:** TATH data import, October 17, 2026
- **Requirement:** For Buyer and Seller transactions, GCI percent must never be above 100%. For Tenant, Landlord, Referred Buyer and Referred Seller transactions, a value above 100% is allowed.
- **Why:** In the TATH data, the four transactions with a value above 100% are all Tenant or Referred Buyer, which is correct. The rule should stop the same value on a Buyer or Seller transaction.
- **Notes:** Show a warning on save instead of silently changing the value.

### FR-004: Warn about possible duplicate Closed transactions
- **Status:** Proposed
- **Source:** TATH data import, October 17, 2026
- **Requirement:** Show a warning when two Closed transactions share the same property, closing date, primary agent and client type.
- **Why:** The TATH data had 2 pairs of Closed duplicates, which had to be fixed by hand. The same check should catch them at entry and on sync.
- **Notes:**
  - Cancelled and Active transactions are not covered. TATH has 54 Cancelled and 5 Active pairs that are acceptable for now and will be reviewed with the client.
  - The warning should name both transactions and link to them. It should not block saving.

### FR-005: Show when Total Payments differ from Total Commission
- **Status:** Proposed
- **Source:** TATH data import, October 17, 2026
- **Requirement:** Make a difference between Total Payments (the sum of the payment amounts on a transaction) and Total Commission easy to see. A difference of more than $1 is flagged on the Transactions table and on the transaction page, with the dollar difference (Payments minus Total Commission). The Transactions table can be filtered or sorted to bring every flagged transaction to the top.
- **Why:** 63 TATH transactions were imported with Payments that differ from Total Commission by more than $1 (44 Closed, 12 Pending, 4 Active, 3 Expired). The differences run from -$31,753 to +$5,775. Some are expected, such as fees taken on a deal, but the team needs to see each one and decide whether it is correct.
- **Notes:**
  - Total Commission is GCI plus GET.
  - Show a plus or minus sign with the amount, and a tooltip that says what the difference means.
  - A difference of $1 or less is not flagged, to allow for rounding.
  - The flag is a warning only. It does not block saving or change any amount.
  - The TATH list is in `data/imports/TATH/payments_vs_total_commission.csv`.

## Done

Nothing yet.
