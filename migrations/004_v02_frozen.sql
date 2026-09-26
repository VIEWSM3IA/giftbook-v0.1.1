-- Preserve V0.2 free text for audit while new cases use a fixed evidence vocabulary.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='public_cases' AND column_name='behavior')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='public_cases' AND column_name='behavior_legacy') THEN
    ALTER TABLE public_cases RENAME COLUMN behavior TO behavior_legacy;
  END IF;
END $$;
ALTER TABLE public_cases ALTER COLUMN behavior_legacy DROP NOT NULL;
ALTER TABLE public_cases ADD COLUMN IF NOT EXISTS behavior_evidence text[];
WITH mapped AS (
  SELECT id, array_remove(ARRAY[
    CASE WHEN behavior_legacy ~ '(收到.{0,4}开心|当场.{0,4}开心|很开心|特别开心|开心了)' THEN 'happy_on_receive' END,
    CASE WHEN behavior_legacy ~ '(当天(就)?用|马上用|立刻用|当场用)' THEN 'used_immediately' END,
    CASE WHEN behavior_legacy ~ '(经常用|一直(在)?用|反复用|常常用)' THEN 'used_repeatedly' END,
    CASE WHEN behavior_legacy ~ '(后来(主动)?提起|之后(主动)?提起|又提起)' THEN 'mentioned_later' END,
    CASE WHEN behavior_legacy ~ '(分享(给|了|到|朋友圈)|发(给|到)朋友)' THEN 'shared_with_others' END
  ]::text[], NULL) AS codes
  FROM public_cases WHERE behavior_evidence IS NULL
)
-- Negated historic prose is ambiguous; keep it as legacy evidence instead of inventing a positive action.
UPDATE public_cases AS c SET behavior_evidence = CASE WHEN c.behavior_legacy ~ '(不|没|未|无)' OR cardinality(mapped.codes) = 0 THEN ARRAY['legacy_observed']::text[] ELSE mapped.codes END
FROM mapped WHERE c.id = mapped.id;
ALTER TABLE public_cases ALTER COLUMN behavior_evidence SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='public_cases' AND column_name='legacy_price_range') THEN
    ALTER TABLE public_cases ADD COLUMN legacy_price_range text;
    UPDATE public_cases SET legacy_price_range=price_range WHERE price_range IN ('0–100','100–300','300–500','500–1000','1000–1500','1500+');
  END IF;
END $$;
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
