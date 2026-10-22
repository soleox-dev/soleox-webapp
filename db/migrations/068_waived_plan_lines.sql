-- Plan lines a deal does not charge (Commission Plans): some rentals and outgoing referrals pay no broker review
-- or risk management. Line keys (broker_review, risk_management, ...); NULL or empty charges every line.
-- A waived line is $0 for every agent on the deal and adds nothing to year-to-date totals.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS waived_plan_lines text[];

NOTIFY pgrst, 'reload schema';
