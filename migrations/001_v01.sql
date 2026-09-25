CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY, display_name varchar(20) NOT NULL DEFAULT '礼物簿用户', avatar_key text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','deleted')),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS wechat_accounts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 appid text NOT NULL, openid text NOT NULL, unionid text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz NOT NULL DEFAULT now(), UNIQUE(appid,openid)
);
CREATE TABLE IF NOT EXISTS local_accounts (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, device_hash text NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE,
 expires_at timestamptz NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recipients (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 display_name varchar(20) NOT NULL CHECK(length(display_name)>0), relation_type text NOT NULL, age_range text NOT NULL DEFAULT '', gender text NOT NULL DEFAULT '', note varchar(200) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 UNIQUE(id,user_id)
);
CREATE TABLE IF NOT EXISTS tags (
 id uuid PRIMARY KEY, category text NOT NULL DEFAULT '兴趣', code text NOT NULL UNIQUE, name text NOT NULL UNIQUE, sort_order integer NOT NULL, enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS recipient_tags (
 recipient_id uuid NOT NULL REFERENCES recipients(id) ON DELETE CASCADE, tag_id uuid NOT NULL REFERENCES tags(id),
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz, PRIMARY KEY(recipient_id,tag_id)
);
CREATE TABLE IF NOT EXISTS gift_records (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE, recipient_id uuid NOT NULL,
 request_id uuid NOT NULL, request_hash text NOT NULL,
 gift_name varchar(60) NOT NULL CHECK(length(gift_name)>0), reaction_level smallint NOT NULL CHECK(reaction_level BETWEEN 1 AND 5), gifted_at date NOT NULL,
 occasion text NOT NULL DEFAULT '', price_fen integer CHECK(price_fen>=0), note varchar(300) NOT NULL DEFAULT '',
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), deleted_at timestamptz,
 FOREIGN KEY(recipient_id,user_id) REFERENCES recipients(id,user_id), UNIQUE(user_id,request_id)
);
CREATE INDEX IF NOT EXISTS recipients_user_active ON recipients(user_id,deleted_at);
CREATE INDEX IF NOT EXISTS gifts_recipient_date ON gift_records(recipient_id,gifted_at DESC,created_at DESC,id DESC) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS gifts_user_created ON gift_records(user_id,created_at DESC);

ALTER TABLE gift_records ALTER COLUMN price_fen TYPE integer USING price_fen::integer;
