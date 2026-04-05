import React from "react";
import { loadStripe } from "@stripe/stripe-js";
import { CheckoutProvider, PaymentElement, useCheckout } from "@stripe/react-stripe-js/checkout";

import { t, type Lang } from "../i18n";

type BillingCheckoutInlineProps = {
  lang: Lang;
  publishableKey: string;
  clientSecret: string;
  planLabel: string;
  priceLabel: string;
  cycleLabel: string;
  onBack: () => void;
  onCancel: () => void;
  onSuccess: () => void;
};

function BillingCheckoutInlineBody(props: BillingCheckoutInlineProps) {
  const checkoutState = useCheckout();
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  if (checkoutState.type === "loading") {
    return <div className="product-plan-empty-card">{t(props.lang, "common.loading")}</div>;
  }

  if (checkoutState.type === "error") {
    return (
      <div className="product-plan-empty-card">
        {checkoutState.error.message || t(props.lang, "auth.billingCheckoutInlineError")}
      </div>
    );
  }

  const { checkout } = checkoutState;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setIsSubmitting(true);
      setSubmitError(null);

      const result: any = await checkout.confirm();

      if (result?.type === "error") {
        setSubmitError(
          result?.error?.message || t(props.lang, "auth.billingCheckoutInlineError")
        );
        return;
      }

      props.onSuccess();
    } catch (error) {
      console.error("billing_checkout_confirm_error", error);
      setSubmitError(t(props.lang, "auth.billingCheckoutInlineError"));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
      <div className="product-plan-cycle-bar">
        <div className="product-plan-cycle-label">{t(props.lang, "auth.billingCheckoutTitle")}</div>
        <div style={{ color: "#4f5d7a", fontSize: 14 }}>
          {t(props.lang, "auth.billingCheckoutSubtitle")}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gap: 12,
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
        }}
      >
        <div
          style={{
            border: "1px solid rgba(46, 83, 214, 0.14)",
            borderRadius: 16,
            background: "rgba(255,255,255,0.88)",
            padding: 16,
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            {t(props.lang, "auth.billingCheckoutPlan")}
          </div>
          <div style={{ fontWeight: 800, color: "#10214d" }}>{props.planLabel}</div>
        </div>

        <div
          style={{
            border: "1px solid rgba(46, 83, 214, 0.14)",
            borderRadius: 16,
            background: "rgba(255,255,255,0.88)",
            padding: 16,
          }}
        >
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 6 }}>
            {t(props.lang, "auth.billingCheckoutAmount")}
          </div>
          <div style={{ fontWeight: 800, color: "#10214d" }}>{props.priceLabel}</div>
          <div style={{ fontSize: 13, color: "#5c6b8a", marginTop: 4 }}>{props.cycleLabel}</div>
        </div>
      </div>

      <div
        style={{
          border: "1px solid rgba(46, 83, 214, 0.14)",
          borderRadius: 16,
          background: "rgba(255,255,255,0.92)",
          padding: 16,
        }}
      >
        <div style={{ marginBottom: 12, fontSize: 13, color: "#4f5d7a" }}>
          {t(props.lang, "auth.billingCheckoutSecureNote")}
        </div>

        <PaymentElement />
      </div>

      {submitError ? (
        <div className="product-plan-empty-card">{submitError}</div>
      ) : null}

      <div
        style={{
          display: "flex",
          gap: 10,
          justifyContent: "flex-end",
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="product-secondary" onClick={props.onBack}>
          {t(props.lang, "auth.billingCheckoutBack")}
        </button>

        <button type="button" className="product-secondary" onClick={props.onCancel}>
          {t(props.lang, "auth.cancel")}
        </button>

        <button type="submit" className="product-primary" disabled={isSubmitting}>
          {isSubmitting
            ? t(props.lang, "auth.billingCheckoutSubmitting")
            : t(props.lang, "auth.billingCheckoutSubmit")}
        </button>
      </div>
    </form>
  );
}

export function BillingCheckoutInline(props: BillingCheckoutInlineProps) {
  const stripePromise = React.useMemo(() => loadStripe(props.publishableKey), [props.publishableKey]);

  if (!props.publishableKey || !props.clientSecret) {
    return (
      <div className="product-plan-empty-card">
        {t(props.lang, "auth.billingCheckoutCreateError")}
      </div>
    );
  }

  return (
    <CheckoutProvider stripe={stripePromise} options={{ clientSecret: props.clientSecret }}>
      <BillingCheckoutInlineBody {...props} />
    </CheckoutProvider>
  );
}