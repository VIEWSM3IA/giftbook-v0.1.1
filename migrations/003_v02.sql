CREATE TABLE IF NOT EXISTS public_cases (
 id uuid PRIMARY KEY,
 owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 source_gift_id uuid REFERENCES gift_records(id) ON DELETE SET NULL,
 gift_name varchar(60) NOT NULL,
 relation_type text NOT NULL,
 age_range text NOT NULL,
 occasion text NOT NULL,
 price_range text NOT NULL,
 wanted_level text NOT NULL,
 reaction_level smallint NOT NULL CHECK(reaction_level BETWEEN 1 AND 5),
 behavior varchar(80) NOT NULL,
 experience varchar(120) NOT NULL DEFAULT '',
 status text NOT NULL CHECK(status IN ('published','removed')),
 helpful_count integer NOT NULL DEFAULT 0 CHECK(helpful_count>=0),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS public_cases_active_gift ON public_cases(source_gift_id) WHERE status='published';
CREATE INDEX IF NOT EXISTS public_cases_feed ON public_cases(created_at DESC,id DESC) WHERE status='published';
CREATE INDEX IF NOT EXISTS public_cases_owner ON public_cases(owner_id,created_at DESC);
CREATE TABLE IF NOT EXISTS case_helpful (
 case_id uuid NOT NULL REFERENCES public_cases(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(case_id,user_id)
);
