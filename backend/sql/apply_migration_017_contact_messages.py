from src.db.pg import pg_conn

sql = """
CREATE SCHEMA IF NOT EXISTS public_site;

CREATE TABLE IF NOT EXISTS public_site.contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  lang VARCHAR(2) NOT NULL CHECK (lang IN ('pt', 'en', 'es')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'landing_contact_form',
  status TEXT NOT NULL DEFAULT 'new',
  email_notification_sent BOOLEAN NOT NULL DEFAULT FALSE,
  email_notification_attempted_at_utc TIMESTAMPTZ NULL,
  email_notification_error TEXT NULL,
  created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at
  ON public_site.contact_messages (created_at_utc DESC);

CREATE INDEX IF NOT EXISTS idx_contact_messages_email
  ON public_site.contact_messages (lower(email));
"""

with pg_conn() as conn:
    with conn.cursor() as cur:
        cur.execute(sql)
    conn.commit()

print("Migration aplicada com sucesso.")