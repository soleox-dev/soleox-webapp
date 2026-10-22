-- Waived plan lines, and which deal statuses count toward plan totals.
--
-- Plan lines a deal does not charge (Commission Plans): some rentals and outgoing referrals pay no broker review
-- or risk management. Line keys (broker_review, risk_management, ...); NULL or empty charges every line.
-- A waived line is $0 for every agent on the deal and adds nothing to year-to-date totals.

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS waived_plan_lines text[];

-- Which deal statuses count toward an agent's year-to-date plan totals (caps, the post-cap fee bucket, yearly
-- limits). NULL means Closed and Pending, as TATH's template counted; a cancelled deal never fills a cap.
ALTER TABLE public.client_commission_plan_settings
  ADD COLUMN IF NOT EXISTS counting_statuses text[];

NOTIFY pgrst, 'reload schema';
