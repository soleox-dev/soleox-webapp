-- Map coordinates for property addresses, for the Transaction Map report (Owner Reports).
--
-- One row per address per client, looked up once with the free US Census geocoder and reused by every deal at that
-- address. The report looks up addresses it has not seen (or whose text changed) and saves the result here, so a
-- deal whose address is edited is simply looked up again under its new text. A row that could not be matched is kept
-- with matched = false, so it is not retried on every visit and the report can list it.
--
-- Any member of the client may read and add rows: the map is used by Owner Reports viewers, who cannot edit deals.
-- Coordinates of an address are not sensitive beyond the address itself, which members already see.
-- ID prefix: GEO_.

CREATE TABLE IF NOT EXISTS public.address_geocodes (
  id text PRIMARY KEY DEFAULT public.generate_prefixed_id('GEO'),
  client_id text NOT NULL REFERENCES public.clients (id) ON DELETE CASCADE,
  -- The address as looked up: trimmed, single-spaced, lower case. Deals match on it.
  address_key text NOT NULL,
  address text NOT NULL,
  matched boolean NOT NULL DEFAULT false,
  latitude double precision,
  longitude double precision,
  -- The address as the geocoder understood it, to spot a wrong match.
  matched_address text,
  source text NOT NULL DEFAULT 'us_census',
  geocoded_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT address_geocodes_client_address_key UNIQUE (client_id, address_key),
  CONSTRAINT address_geocodes_point_check CHECK (
    (matched AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
    OR (NOT matched AND latitude IS NULL AND longitude IS NULL)
  )
);

ALTER TABLE public.address_geocodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view address geocodes" ON public.address_geocodes;
CREATE POLICY "Members can view address geocodes" ON public.address_geocodes
  FOR SELECT TO public
  USING (public.is_client_member(client_id) OR public.is_platform_super_admin());

DROP POLICY IF EXISTS "Members can add address geocodes" ON public.address_geocodes;
CREATE POLICY "Members can add address geocodes" ON public.address_geocodes
  FOR INSERT TO public
  WITH CHECK (public.is_client_member(client_id) OR public.is_platform_super_admin());

DROP POLICY IF EXISTS "Members can update address geocodes" ON public.address_geocodes;
CREATE POLICY "Members can update address geocodes" ON public.address_geocodes
  FOR UPDATE TO public
  USING (public.is_client_member(client_id) OR public.is_platform_super_admin())
  WITH CHECK (public.is_client_member(client_id) OR public.is_platform_super_admin());

GRANT SELECT, INSERT, UPDATE ON public.address_geocodes TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
