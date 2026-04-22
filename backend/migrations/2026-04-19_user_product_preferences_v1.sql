BEGIN;

CREATE TABLE IF NOT EXISTS app.user_product_preferences (
    user_id BIGINT PRIMARY KEY REFERENCES app.users(user_id) ON DELETE CASCADE,
    bettor_profile TEXT NULL,
    narrative_style TEXT NOT NULL DEFAULT 'leve',
    completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT user_product_preferences_bettor_profile_ck CHECK (
        bettor_profile IS NULL OR bettor_profile IN ('recreativo', 'profissional', 'criador')
    ),
    CONSTRAINT user_product_preferences_narrative_style_ck CHECK (
        narrative_style IN ('leve', 'equilibrado', 'pro')
    )
);

CREATE INDEX IF NOT EXISTS ix_user_product_preferences_updated_at
ON app.user_product_preferences (updated_at_utc DESC);

COMMIT;