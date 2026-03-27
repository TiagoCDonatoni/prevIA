import React, { useEffect } from "react";

import { PRODUCT_AUTH_ENABLED } from "../../config";
import { fetchAccessUsage } from "../api/access";
import { fetchAuthMe, normalizeBackendPlanCode } from "../api/auth";
import { useProductStore } from "./productStore";

export default function ProductBootstrap({
  children,
}: {
  children: React.ReactNode;
}) {
  const store = useProductStore();

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!PRODUCT_AUTH_ENABLED) return;

      try {
        const data = await fetchAuthMe();
        if (cancelled) return;

        store.applyBackendBootstrap({
          is_authenticated: Boolean(data.is_authenticated),
          email: data.user?.email ?? null,
          plan: normalizeBackendPlanCode(data.subscription?.plan_code),
          auth_mode: data.auth_mode ?? null,
          user_id: data.user?.user_id ?? null,
          full_name: data.user?.full_name ?? null,
          preferred_lang: data.user?.preferred_lang ?? null,
          user_status: data.user?.status ?? null,
          email_verified: data.user?.email_verified ?? null,
          subscription_plan_code: data.subscription?.plan_code ?? null,
          subscription_status: data.subscription?.status ?? null,
          subscription_provider: data.subscription?.provider ?? null,
          subscription_billing_cycle: data.subscription?.billing_cycle ?? null,
        });

        if (!data.is_authenticated) {
          return;
        }

        const usage = await fetchAccessUsage();
        if (cancelled) return;

        store.applyBackendUsage({
          date_key: usage.date_key,
          credits_used: usage.usage.credits_used,
          revealed_count: usage.usage.revealed_count,
          daily_limit: usage.usage.daily_limit,
          remaining: usage.usage.remaining,
          revealed_fixture_keys: usage.usage.revealed_fixture_keys,
        });
      } catch (err) {
        console.error("product bootstrap failed", err);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{children}</>;
}