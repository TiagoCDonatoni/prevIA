BEGIN;

CREATE TABLE IF NOT EXISTS tools.bankroll_accounts (
    account_id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app.users(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    currency_code TEXT NOT NULL DEFAULT 'BRL',
    initial_balance_cents BIGINT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'active',
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bankroll_accounts_account_user_uk UNIQUE (account_id, user_id),
    CONSTRAINT bankroll_accounts_name_ck CHECK (LENGTH(BTRIM(name)) BETWEEN 1 AND 120),
    CONSTRAINT bankroll_accounts_currency_ck CHECK (
        currency_code = UPPER(currency_code) AND LENGTH(currency_code) = 3
    ),
    CONSTRAINT bankroll_accounts_initial_balance_ck CHECK (initial_balance_cents >= 0),
    CONSTRAINT bankroll_accounts_status_ck CHECK (status IN ('active', 'archived'))
);

CREATE INDEX IF NOT EXISTS ix_bankroll_accounts_user_status
ON tools.bankroll_accounts (user_id, status, created_at_utc DESC);

CREATE TABLE IF NOT EXISTS tools.bankroll_entries (
    entry_id BIGSERIAL PRIMARY KEY,
    account_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    placed_at_utc TIMESTAMPTZ NOT NULL,
    event_name TEXT NOT NULL,
    bookmaker TEXT NOT NULL,
    market TEXT NOT NULL,
    selection TEXT NOT NULL,
    odds_decimal NUMERIC(12, 4) NOT NULL,
    stake_cents BIGINT NOT NULL,
    result TEXT NOT NULL DEFAULT 'pending',
    return_cents BIGINT NULL,
    notes TEXT NULL,
    settled_at_utc TIMESTAMPTZ NULL,
    created_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at_utc TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at_utc TIMESTAMPTZ NULL,
    CONSTRAINT bankroll_entries_account_user_fk
        FOREIGN KEY (account_id, user_id)
        REFERENCES tools.bankroll_accounts(account_id, user_id)
        ON DELETE CASCADE,
    CONSTRAINT bankroll_entries_event_name_ck CHECK (LENGTH(BTRIM(event_name)) BETWEEN 1 AND 240),
    CONSTRAINT bankroll_entries_bookmaker_ck CHECK (LENGTH(BTRIM(bookmaker)) BETWEEN 1 AND 120),
    CONSTRAINT bankroll_entries_market_ck CHECK (LENGTH(BTRIM(market)) BETWEEN 1 AND 160),
    CONSTRAINT bankroll_entries_selection_ck CHECK (LENGTH(BTRIM(selection)) BETWEEN 1 AND 160),
    CONSTRAINT bankroll_entries_odds_ck CHECK (odds_decimal > 1 AND odds_decimal <= 10000),
    CONSTRAINT bankroll_entries_stake_ck CHECK (stake_cents > 0),
    CONSTRAINT bankroll_entries_return_ck CHECK (return_cents IS NULL OR return_cents >= 0),
    CONSTRAINT bankroll_entries_notes_ck CHECK (notes IS NULL OR LENGTH(notes) <= 2000),
    CONSTRAINT bankroll_entries_result_ck CHECK (result IN ('pending', 'won', 'lost', 'void', 'cashout')),
    CONSTRAINT bankroll_entries_settlement_ck CHECK (
        (result = 'pending' AND return_cents IS NULL AND settled_at_utc IS NULL)
        OR (
            result = 'won'
            AND return_cents IS NOT NULL
            AND return_cents > stake_cents
            AND settled_at_utc IS NOT NULL
        )
        OR (
            result = 'lost'
            AND return_cents IS NOT NULL
            AND return_cents = 0
            AND settled_at_utc IS NOT NULL
        )
        OR (
            result = 'void'
            AND return_cents IS NOT NULL
            AND return_cents = stake_cents
            AND settled_at_utc IS NOT NULL
        )
        OR (result = 'cashout' AND return_cents IS NOT NULL AND settled_at_utc IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS ix_bankroll_entries_user_active_placed
ON tools.bankroll_entries (user_id, placed_at_utc DESC, entry_id DESC)
WHERE deleted_at_utc IS NULL;

CREATE INDEX IF NOT EXISTS ix_bankroll_entries_account_active_result
ON tools.bankroll_entries (account_id, result, placed_at_utc DESC)
WHERE deleted_at_utc IS NULL;

CREATE INDEX IF NOT EXISTS ix_bankroll_entries_user_deleted
ON tools.bankroll_entries (user_id, deleted_at_utc)
WHERE deleted_at_utc IS NOT NULL;

COMMIT;
