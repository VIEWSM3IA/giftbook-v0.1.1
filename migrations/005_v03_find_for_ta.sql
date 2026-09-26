ALTER TABLE public_cases ALTER COLUMN owner_id DROP NOT NULL;
ALTER TABLE public_cases ADD COLUMN IF NOT EXISTS source_type text NOT NULL DEFAULT 'user_generated';
ALTER TABLE public_cases ADD COLUMN IF NOT EXISTS seed_key text;
CREATE UNIQUE INDEX IF NOT EXISTS public_cases_seed_key ON public_cases(seed_key) WHERE seed_key IS NOT NULL;
ALTER TABLE public_cases DROP CONSTRAINT IF EXISTS public_cases_source_valid;
ALTER TABLE public_cases ADD CONSTRAINT public_cases_source_valid CHECK (
  (source_type='user_generated' AND owner_id IS NOT NULL AND seed_key IS NULL) OR
  (source_type IN ('verified_seed','internal_mock') AND owner_id IS NULL AND source_gift_id IS NULL AND seed_key IS NOT NULL)
);
ALTER TABLE public_cases DROP CONSTRAINT IF EXISTS public_cases_evidence_valid;
ALTER TABLE public_cases ADD CONSTRAINT public_cases_evidence_valid CHECK (
  cardinality(behavior_evidence) BETWEEN 1 AND 5 AND
  behavior_evidence <@ ARRAY['happy_on_receive','used_immediately','used_repeatedly','mentioned_later','shared_with_others','polite_thanks_only','rarely_used','returned_or_exchanged','legacy_observed']::text[] AND
  (NOT behavior_evidence @> ARRAY['legacy_observed']::text[] OR behavior_legacy IS NOT NULL) AND
  cardinality(array_positions(behavior_evidence,'happy_on_receive')) <= 1 AND
  cardinality(array_positions(behavior_evidence,'used_immediately')) <= 1 AND
  cardinality(array_positions(behavior_evidence,'used_repeatedly')) <= 1 AND
  cardinality(array_positions(behavior_evidence,'mentioned_later')) <= 1 AND
  cardinality(array_positions(behavior_evidence,'shared_with_others')) <= 1 AND
  cardinality(array_positions(behavior_evidence,'polite_thanks_only')) <= 1 AND
  cardinality(array_positions(behavior_evidence,'rarely_used')) <= 1 AND
  cardinality(array_positions(behavior_evidence,'returned_or_exchanged')) <= 1 AND
  cardinality(array_positions(behavior_evidence,'legacy_observed')) <= 1
);
CREATE TABLE IF NOT EXISTS saved_gifts (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE,
  source_case_id uuid REFERENCES public_cases(id) ON DELETE SET NULL,
  gift_name varchar(60) NOT NULL,
  source_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  intended_occasion text NOT NULL,
  intended_price_range text NOT NULL,
  status text NOT NULL CHECK(status IN ('saved','gifted','removed')),
  linked_gift_id uuid REFERENCES gift_records(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_gifts_list ON saved_gifts(user_id,recipient_id,status,created_at DESC);
CREATE INDEX IF NOT EXISTS saved_gifts_source ON saved_gifts(source_case_id);
CREATE INDEX IF NOT EXISTS saved_gifts_linked ON saved_gifts(linked_gift_id);
CREATE UNIQUE INDEX IF NOT EXISTS saved_gifts_active_case ON saved_gifts(user_id,recipient_id,source_case_id) WHERE status='saved';
