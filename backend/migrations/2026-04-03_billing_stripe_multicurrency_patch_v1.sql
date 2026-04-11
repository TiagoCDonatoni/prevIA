UPDATE billing.plan_prices
SET
    unit_amount_cents = 1490,
    provider_product_id = 'prod_UGWqG1sGZV4y7u',
    provider_price_id = 'price_1THzmiPorMiU8rkTVZl7WYkB',
    metadata_json = jsonb_build_object(
        'label', 'Basic mensal',
        'display_amounts', jsonb_build_object(
            'BRL', 1490,
            'USD', 900
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'basic_v1_monthly';

UPDATE billing.plan_prices
SET
    unit_amount_cents = 3990,
    provider_product_id = 'prod_UGWqG1sGZV4y7u',
    provider_price_id = 'price_1TI01JPorMiU8rkTMXdQL8vf',
    metadata_json = jsonb_build_object(
        'label', 'Basic trimestral',
        'display_amounts', jsonb_build_object(
            'BRL', 3990,
            'USD', 2400
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'basic_v1_quarterly';

UPDATE billing.plan_prices
SET
    unit_amount_cents = 14900,
    provider_product_id = 'prod_UGWqG1sGZV4y7u',
    provider_price_id = 'price_1TI01JPorMiU8rkTgNwbZbDZ',
    metadata_json = jsonb_build_object(
        'label', 'Basic anual',
        'display_amounts', jsonb_build_object(
            'BRL', 14900,
            'USD', 9000
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'basic_v1_annual';

UPDATE billing.plan_prices
SET
    unit_amount_cents = 3990,
    provider_product_id = 'prod_UGWsxfwSKHnvcr',
    provider_price_id = 'price_1THzopPorMiU8rkTOzPOkhoW',
    metadata_json = jsonb_build_object(
        'label', 'Light mensal',
        'display_amounts', jsonb_build_object(
            'BRL', 3990,
            'USD', 1900
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'light_v1_monthly';

UPDATE billing.plan_prices
SET
    unit_amount_cents = 10790,
    provider_product_id = 'prod_UGWsxfwSKHnvcr',
    provider_price_id = 'price_1TI02GPorMiU8rkTM8IQ4iHU',
    metadata_json = jsonb_build_object(
        'label', 'Light trimestral',
        'display_amounts', jsonb_build_object(
            'BRL', 10790,
            'USD', 5100
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'light_v1_quarterly';

UPDATE billing.plan_prices
SET
    unit_amount_cents = 39900,
    provider_product_id = 'prod_UGWsxfwSKHnvcr',
    provider_price_id = 'price_1TI03gPorMiU8rkTjbP16d7R',
    metadata_json = jsonb_build_object(
        'label', 'Light anual',
        'display_amounts', jsonb_build_object(
            'BRL', 39900,
            'USD', 19000
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'light_v1_annual';

UPDATE billing.plan_prices
SET
    unit_amount_cents = 6990,
    provider_product_id = 'prod_UGWvlRKlvkaKNV',
    provider_price_id = 'price_1THzrKPorMiU8rkTsv5Wg9o7',
    metadata_json = jsonb_build_object(
        'label', 'Pro mensal',
        'display_amounts', jsonb_build_object(
            'BRL', 6990,
            'USD', 3900
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'pro_v1_monthly';

UPDATE billing.plan_prices
SET
    unit_amount_cents = 18890,
    provider_product_id = 'prod_UGWvlRKlvkaKNV',
    provider_price_id = 'price_1TI05QPorMiU8rkTdbRwnl4V',
    metadata_json = jsonb_build_object(
        'label', 'Pro trimestral',
        'display_amounts', jsonb_build_object(
            'BRL', 18890,
            'USD', 10500
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'pro_v1_quarterly';

UPDATE billing.plan_prices
SET
    unit_amount_cents = 69900,
    provider_product_id = 'prod_UGWvlRKlvkaKNV',
    provider_price_id = 'price_1TI05QPorMiU8rkT91mxKLZC',
    metadata_json = jsonb_build_object(
        'label', 'Pro anual',
        'display_amounts', jsonb_build_object(
            'BRL', 69900,
            'USD', 39000
        )
    ),
    updated_at_utc = NOW()
WHERE price_code = 'pro_v1_annual';

COMMIT;