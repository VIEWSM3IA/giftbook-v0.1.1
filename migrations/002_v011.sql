-- Keep existing recipient data and its former newest-first order on first upgrade.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='recipients' AND column_name='sort_order') THEN
    ALTER TABLE recipients ADD COLUMN sort_order integer NOT NULL DEFAULT 0;
    UPDATE recipients r SET sort_order=ordered.position
    FROM (SELECT id, row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC,id DESC)::integer AS position FROM recipients) ordered
    WHERE r.id=ordered.id;
  END IF;
END $$;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_recipient_id uuid REFERENCES recipients(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS recipients_user_order ON recipients(user_id,sort_order,id) WHERE deleted_at IS NULL;
