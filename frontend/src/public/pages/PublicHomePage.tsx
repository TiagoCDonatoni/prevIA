import React from "react";
import { Link, useParams } from "react-router-dom";

import { publicCopy } from "../content/publicCopy";
import { coercePublicLang } from "../lib/publicLang";

import { BetaLeadForm } from "../components/BetaLeadForm";

import heroProductPreviewImg from "../assets/previews/landing-hero-product.png";
import previewMainImg from "../assets/previews/landing-main.png";
import previewMarketImg from "../assets/previews/landing-market.png";
import previewAnalyticsImg from "../assets/previews/landing-analytics.png";
import { PublicFreeAnonEmbed } from "../../product/components/PublicFreeAnonEmbed";
import { productListLeagues } from "../../api/client";
import type { ProductLeagueItem } from "../../api/contracts";

import {
  ENABLE_PUBLIC_FREE_ANON_EMBED,
  ENABLE_PUBLIC_PRODUCT_LAYER,
} from "../../config";
import {
  dailyLimitForPlan,
  featuresForPlan,
  normalizePlanId,
  visibilityForPlan,
  type PlanId,
} from "../../product/entitlements";

import { usePublicSeo } from "../lib/publicSeo";

const PREVIEW_IMAGES = [
  previewMainImg,
  previewMarketImg,
  previewAnalyticsImg,
] as const;

type LandingHeroIconName =
  | "chart"
  | "target"
  | "globe"
  | "language"
  | "odds"
  | "probability"
  | "fairPrice"
  | "value";

const HERO_TRUST_ICONS: LandingHeroIconName[] = [
  "chart",
  "target",
  "globe",
  "language",
];

const HERO_FEATURE_ICONS: LandingHeroIconName[] = [
  "odds",
  "probability",
  "fairPrice",
  "value",
];

const LANDING_AUDIENCE_CARD_ICONS: LandingHeroIconName[] = [
  "target",
  "chart",
  "value",
];

const LANDING_AUDIENCE_LOGIC_ICONS: LandingHeroIconName[] = [
  "odds",
  "probability",
  "fairPrice",
  "value",
];

function LandingHeroIcon({ name }: { name: LandingHeroIconName }) {
  if (name === "chart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19V10M12 19V5M19 19v-7" />
      </svg>
    );
  }

  if (name === "target") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0-9-9" />
        <path d="M12 17a5 5 0 1 0-5-5" />
        <path d="M12 13l7-7" />
        <path d="M16 6h3V3" />
      </svg>
    );
  }

  if (name === "globe") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18" />
        <path d="M12 3c2.4 2.5 3.6 5.5 3.6 9S14.4 18.5 12 21" />
        <path d="M12 3c-2.4 2.5-3.6 5.5-3.6 9S9.6 18.5 12 21" />
      </svg>
    );
  }

  if (name === "language") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h9" />
        <path d="M8.5 3v2" />
        <path d="M6 9c1.2 2 3.4 3.8 6 5" />
        <path d="M12 5c-.8 3.4-2.7 6-6 8" />
        <path d="M14 21l4-9 4 9" />
        <path d="M15.5 18h5" />
      </svg>
    );
  }

  if (name === "probability") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 18L18 6" />
        <circle cx="8" cy="8" r="2.2" />
        <circle cx="16" cy="16" r="2.2" />
      </svg>
    );
  }

  if (name === "fairPrice") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18" />
        <path d="M7 7h7.5a3 3 0 0 1 0 6H9.5a3 3 0 0 0 0 6H17" />
      </svg>
    );
  }

  if (name === "value") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 16l5-5 4 4 7-8" />
        <path d="M14 7h6v6" />
        <path d="M5 20h14" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 16l5-5 4 4 7-8" />
      <path d="M20 7v6h-6" />
    </svg>
  );
}

type LandingLang = "pt" | "en" | "es";

const PUBLIC_LANDING_FREE_PLAN_ID: PlanId = "FREE";

type LandingLeagueCoverageGroupKey =
  | "southAmerica"
  | "northAmerica"
  | "europe"
  | "asiaOceania"
  | "africa"
  | "international"
  | "other";

type LandingLeagueCoverageGroupLabels = Record<LandingLeagueCoverageGroupKey, string>;

type LandingLeagueCoverageDisplayItem = {
  key: string;
  name: string;
  country: string;
};

type LandingLeagueCoverageGroup = {
  key: LandingLeagueCoverageGroupKey;
  label: string;
  items: LandingLeagueCoverageDisplayItem[];
};

const LANDING_LEAGUE_COVERAGE_FALLBACK_COUNT = 50;

const LANDING_LEAGUE_GROUP_ORDER: LandingLeagueCoverageGroupKey[] = [
  "southAmerica",
  "northAmerica",
  "europe",
  "asiaOceania",
  "africa",
  "international",
  "other",
];

const LANDING_LEAGUE_GROUP_BY_COUNTRY_CODE: Record<string, LandingLeagueCoverageGroupKey> = {
  AR: "southAmerica",
  BO: "southAmerica",
  BR: "southAmerica",
  CL: "southAmerica",
  CO: "southAmerica",
  EC: "southAmerica",
  PY: "southAmerica",
  PE: "southAmerica",
  UY: "southAmerica",
  VE: "southAmerica",
  CONMEBOL: "southAmerica",

  CA: "northAmerica",
  MX: "northAmerica",
  US: "northAmerica",
  CONCACAF: "northAmerica",

  AT: "europe",
  BE: "europe",
  BG: "europe",
  CH: "europe",
  CZ: "europe",
  DE: "europe",
  DK: "europe",
  EE: "europe",
  EN: "europe",
  ES: "europe",
  FI: "europe",
  FR: "europe",
  GB: "europe",
  "GB-ENG": "europe",
  "GB-SCT": "europe",
  GR: "europe",
  HR: "europe",
  HU: "europe",
  IE: "europe",
  IS: "europe",
  IT: "europe",
  NL: "europe",
  NO: "europe",
  PL: "europe",
  PT: "europe",
  RO: "europe",
  RS: "europe",
  RU: "europe",
  SE: "europe",
  SK: "europe",
  SI: "europe",
  TR: "europe",
  UA: "europe",
  UEFA: "europe",

  AU: "asiaOceania",
  CN: "asiaOceania",
  IL: "asiaOceania",
  IN: "asiaOceania",
  JP: "asiaOceania",
  KR: "asiaOceania",
  NZ: "asiaOceania",
  SA: "asiaOceania",
  AFC: "asiaOceania",

  EG: "africa",
  CAF: "africa",

  FIFA: "international",
};

function normalizeLandingLeagueCountryCode(value: string | null | undefined): string {
  return String(value || "").trim().toUpperCase();
}

function getLandingLeagueCoverageGroupKey(item: ProductLeagueItem): LandingLeagueCoverageGroupKey {
  const sportKey = String(item.sport_key || "").toLowerCase();
  const countryCode = normalizeLandingLeagueCountryCode(item.official_country_code);

  if (
    countryCode === "FIFA" ||
    sportKey.includes("fifa_world_cup") ||
    sportKey.includes("club_world_cup")
  ) {
    return "international";
  }

  return LANDING_LEAGUE_GROUP_BY_COUNTRY_CODE[countryCode] ?? "other";
}

function getLandingLeagueDisplayName(item: ProductLeagueItem): string {
  return String(item.official_name || item.sport_title || item.sport_key || "")
    .replace(/\s+/g, " ")
    .trim();
}

function getLandingLeagueCountryName(item: ProductLeagueItem): string {
  const countryName = String(item.country_name || "").trim();
  if (countryName) return countryName;

  const countryCode = normalizeLandingLeagueCountryCode(item.official_country_code);
  return countryCode;
}

function buildLandingLeagueCoverageGroups(
  items: ProductLeagueItem[],
  labels: LandingLeagueCoverageGroupLabels,
): LandingLeagueCoverageGroup[] {
  const buckets = new Map<LandingLeagueCoverageGroupKey, LandingLeagueCoverageDisplayItem[]>();

  for (const key of LANDING_LEAGUE_GROUP_ORDER) {
    buckets.set(key, []);
  }

  for (const item of items) {
    const name = getLandingLeagueDisplayName(item);
    if (!name) continue;

    const groupKey = getLandingLeagueCoverageGroupKey(item);
    const country = getLandingLeagueCountryName(item);

    buckets.get(groupKey)?.push({
      key: item.sport_key,
      name,
      country,
    });
  }

  return LANDING_LEAGUE_GROUP_ORDER.map((key) => {
    const groupItems = [...(buckets.get(key) ?? [])].sort((a, b) => {
      const byCountry = a.country.localeCompare(b.country, undefined, { sensitivity: "base" });
      if (byCountry !== 0) return byCountry;

      return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
    });

    return {
      key,
      label: labels[key],
      items: groupItems,
    };
  }).filter((group) => group.items.length > 0);
}

function getUnifiedFreePlanMeta(lang: LandingLang) {
  return {
    pt: "até 5 créditos",
    en: "up to 5 credits",
    es: "hasta 5 créditos",
  }[lang];
}

function getUnifiedFreePlanFlowCopy(lang: LandingLang) {
  return {
    pt: {
      summary:
        "Teste sem conta disponível na landing. Criando uma conta grátis, você continua explorando dentro dos limites do plano Free.",
      card: "Teste direto na landing e continue grátis com conta quando quiser mais continuidade.",
    },
    en: {
      summary:
        "A no-account trial is available on the landing page. With a free account, you can keep exploring within the Free plan limits.",
      card: "Try it directly on the landing page and continue for free with an account when you want more continuity.",
    },
    es: {
      summary:
        "La prueba sin cuenta está disponible en la landing. Con una cuenta gratis, puedes seguir explorando dentro de los límites del plan Free.",
      card: "Prueba directo en la landing y continúa gratis con cuenta cuando quieras más continuidad.",
    },
  }[lang];
}

function getLandingAudienceLogicCopy(lang: LandingLang) {
  return {
    pt: {
      panelPill: "Odds → Probabilidade → Valor",
      logicTitle: "Como o prevIA organiza a leitura",
      logicSteps: ["Odds", "Probabilidade", "Preço justo", "Valor"],
      exampleTitle: "Exemplo de leitura",
      homeLabel: "Time A",
      awayLabel: "Time B",
      fairPrice: "Preço justo 2.05",
    },
    en: {
      panelPill: "Odds → Probability → Value",
      logicTitle: "How prevIA organizes the reading",
      logicSteps: ["Odds", "Probability", "Fair price", "Value"],
      exampleTitle: "Reading example",
      homeLabel: "Team A",
      awayLabel: "Team B",
      fairPrice: "Fair price 2.05",
    },
    es: {
      panelPill: "Cuotas → Probabilidad → Valor",
      logicTitle: "Cómo prevIA organiza la lectura",
      logicSteps: ["Cuotas", "Probabilidad", "Precio justo", "Valor"],
      exampleTitle: "Ejemplo de lectura",
      homeLabel: "Equipo A",
      awayLabel: "Equipo B",
      fairPrice: "Precio justo 2.05",
    },
  }[lang];
}

type BillingCycle = "monthly" | "quarterly" | "annual";
type PricingCurrency = "BRL" | "USD";
type PaidPlanId = "BASIC" | "LIGHT" | "PRO";

const PRICING_CURRENCIES: PricingCurrency[] = ["BRL", "USD"];
const BILLING_CYCLES: BillingCycle[] = ["annual", "quarterly", "monthly"];

const DEFAULT_CURRENCY_BY_LANG: Record<LandingLang, PricingCurrency> = {
  pt: "BRL",
  en: "USD",
  es: "USD",
};

const LANDING_PLAN_PRICES: Record<
  PaidPlanId,
  Record<PricingCurrency, Record<BillingCycle, number>>
> = {
  BASIC: {
    BRL: {
      monthly: 14.9,
      quarterly: 39.9,
      annual: 149,
    },
    USD: {
      monthly: 9,
      quarterly: 24,
      annual: 90,
    },
  },
  LIGHT: {
    BRL: {
      monthly: 39.9,
      quarterly: 107.9,
      annual: 399,
    },
    USD: {
      monthly: 19,
      quarterly: 51,
      annual: 190,
    },
  },
  PRO: {
    BRL: {
      monthly: 69.9,
      quarterly: 188.9,
      annual: 699,
    },
    USD: {
      monthly: 39,
      quarterly: 105,
      annual: 390,
    },
  },
};

function isPaidPlanId(planId: PlanId): planId is PaidPlanId {
  return planId === "BASIC" || planId === "LIGHT" || planId === "PRO";
}

function formatLandingPrice(
  value: number,
  currency: PricingCurrency,
): string {
  const locale = currency === "BRL" ? "pt-BR" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: currency === "BRL" ? 2 : 0,
    maximumFractionDigits: currency === "BRL" ? 2 : 0,
  }).format(value);
}

function getLandingPricingCopy(lang: LandingLang) {
  return {
    pt: {
      currencyLabel: "Moeda",
      billingLabel: "Recorrência",
      currencyOptions: {
        BRL: "R$",
        USD: "US$",
      },
      billingOptions: {
        annual: "Anual",
        quarterly: "Trimestral",
        monthly: "Mensal",
      },
      billingNotes: {
        annual: "cobrança anual",
        quarterly: "cobrança trimestral",
        monthly: "cobrança mensal",
      },
      free: "Grátis",
      freeAnon: "Teste grátis",
      noBilling: "sem cobrança",
    },
    en: {
      currencyLabel: "Currency",
      billingLabel: "Billing",
      currencyOptions: {
        BRL: "BRL",
        USD: "USD",
      },
      billingOptions: {
        annual: "Annual",
        quarterly: "Quarterly",
        monthly: "Monthly",
      },
      billingNotes: {
        annual: "billed yearly",
        quarterly: "billed quarterly",
        monthly: "billed monthly",
      },
      free: "Free",
      freeAnon: "Free trial",
      noBilling: "no charge",
    },
    es: {
      currencyLabel: "Moneda",
      billingLabel: "Cobro",
      currencyOptions: {
        BRL: "BRL",
        USD: "USD",
      },
      billingOptions: {
        annual: "Anual",
        quarterly: "Trimestral",
        monthly: "Mensual",
      },
      billingNotes: {
        annual: "cobro anual",
        quarterly: "cobro trimestral",
        monthly: "cobro mensual",
      },
      free: "Gratis",
      freeAnon: "Prueba gratis",
      noBilling: "sin cobro",
    },
  }[lang];
}

function getLandingPlanPricePresentation(
  planId: PlanId,
  currency: PricingCurrency,
  cycle: BillingCycle,
  lang: LandingLang,
  showPublicFreeAnon: boolean,
) {
  const copy = getLandingPricingCopy(lang);

  if (planId === "FREE_ANON") {
    return {
      amount: showPublicFreeAnon ? copy.freeAnon : copy.free,
      note: copy.noBilling,
      isFree: true,
    };
  }

  if (planId === "FREE") {
    return {
      amount: copy.free,
      note: copy.noBilling,
      isFree: true,
    };
  }

  if (!isPaidPlanId(planId)) {
    return {
      amount: "",
      note: "",
      isFree: false,
    };
  }

  const value = LANDING_PLAN_PRICES[planId][currency][cycle];

  return {
    amount: formatLandingPrice(value, currency),
    note: copy.billingNotes[cycle],
    isFree: false,
  };
}

function buildLandingPlanMeta(planId: PlanId, lang: LandingLang): string[] {
  const visibility = visibilityForPlan(planId);
  const features = featuresForPlan(planId);
  const credits = dailyLimitForPlan(planId);

  if (planId === "FREE") {
    return [getUnifiedFreePlanMeta(lang)];
  }

  const copy = {
    pt: {
      credits: `${credits} créditos/dia`,
      value: "value",
      fairOdds: "fair odds + edge",
      confidence: "confiança",
      metrics: "métricas",
      chat: "chat",
    },
    en: {
      credits: `${credits} credits/day`,
      value: "value",
      fairOdds: "fair odds + edge",
      confidence: "confidence",
      metrics: "metrics",
      chat: "chat",
    },
    es: {
      credits: `${credits} créditos/día`,
      value: "value",
      fairOdds: "fair odds + edge",
      confidence: "confianza",
      metrics: "métricas",
      chat: "chat",
    },
  }[lang];

  const items = [copy.credits];

  if (visibility.value.show_fair_odds && visibility.value.show_edge_percent) {
    items.push(copy.fairOdds);
  } else if (visibility.value.show_value_detected) {
    items.push(copy.value);
  }

  if (visibility.context.show_confidence_level) items.push(copy.confidence);
  if (visibility.model.show_metrics) items.push(copy.metrics);
  if (features.chat) items.push(copy.chat);

  return items.slice(0, 4);
}
export function PublicHomePage() {
  const { lang } = useParams<{ lang: string }>();
  const currentLang = coercePublicLang(lang);
  const landingLang = currentLang as LandingLang;
  const copy = publicCopy(currentLang);
  const showPublicFreeAnon = ENABLE_PUBLIC_PRODUCT_LAYER && ENABLE_PUBLIC_FREE_ANON_EMBED;

  const landingPlans = copy.home.plans.items.filter(
    (item) => normalizePlanId(item.planId) !== "FREE_ANON",
  );

  const freeFlowCopy = getUnifiedFreePlanFlowCopy(currentLang as LandingLang);

  const [selectedLandingPlan, setSelectedLandingPlan] = React.useState<PlanId>("LIGHT");
  const [displayCurrency, setDisplayCurrency] = React.useState<PricingCurrency>(
    DEFAULT_CURRENCY_BY_LANG[landingLang],
  );
  const [billingCycle, setBillingCycle] = React.useState<BillingCycle>("annual");
  const [isLeagueCoverageModalOpen, setIsLeagueCoverageModalOpen] = React.useState(false);
  const [leagueCoverageItems, setLeagueCoverageItems] = React.useState<ProductLeagueItem[]>([]);
  const [leagueCoverageCount, setLeagueCoverageCount] = React.useState<number | null>(null);
  const [leagueCoverageLoading, setLeagueCoverageLoading] = React.useState(false);
  const [leagueCoverageError, setLeagueCoverageError] = React.useState("");

  React.useEffect(() => {
    let isMounted = true;

    setLeagueCoverageLoading(true);
    setLeagueCoverageError("");

    productListLeagues()
      .then((response) => {
        if (!isMounted) return;

        const items = Array.isArray(response.items) ? response.items : [];
        const count =
          typeof response.count === "number" && Number.isFinite(response.count)
            ? response.count
            : items.length;

        setLeagueCoverageItems(items);
        setLeagueCoverageCount(count);
      })
      .catch((error) => {
        if (!isMounted) return;

        setLeagueCoverageError(error instanceof Error ? error.message : "Failed to load leagues");
      })
      .finally(() => {
        if (!isMounted) return;

        setLeagueCoverageLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  React.useEffect(() => {
    if (!isLeagueCoverageModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsLeagueCoverageModalOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isLeagueCoverageModalOpen]);

  const pricingCopy = getLandingPricingCopy(landingLang);

  const leagueCoverageCopy = copy.home.leagueCoverage;
  const leagueCoverageDisplayCount =
    leagueCoverageCount ??
    (leagueCoverageItems.length > 0 ? leagueCoverageItems.length : LANDING_LEAGUE_COVERAGE_FALLBACK_COUNT);

  const leagueCoverageTitle = leagueCoverageCopy.countLabel.replace(
    "{count}",
    String(leagueCoverageDisplayCount),
  );

  const leagueCoverageGroups = React.useMemo(
    () => buildLandingLeagueCoverageGroups(leagueCoverageItems, leagueCoverageCopy.groupLabels),
    [leagueCoverageItems, leagueCoverageCopy.groupLabels],
  );

  /*
   * Card "Plano em foco" preservado para possível reativação futura.
   *
   * const selectedPlanCard =
   *   landingPlans.find((item) => normalizePlanId(item.planId) === selectedLandingPlan) ??
   *   landingPlans.find((item) => normalizePlanId(item.planId) === "LIGHT") ??
   *   landingPlans[0];
   */

  React.useEffect(() => {
    if (selectedLandingPlan === "FREE_ANON") {
      setSelectedLandingPlan(PUBLIC_LANDING_FREE_PLAN_ID);
    }
  }, [selectedLandingPlan]);

  /*
   * Card "Plano em foco" preservado para possível reativação futura.
   *
   * const selectedPlanPricing = getLandingPlanPricePresentation(
   *   selectedLandingPlan,
   *   displayCurrency,
   *   billingCycle,
   *   landingLang,
   *   showPublicFreeAnon,
   * );
   * const selectedPlanMetaItems = buildLandingPlanMeta(selectedLandingPlan, landingLang);
   */
   
  const heroVisualTitle = copy.home.preview.items[0]?.title ?? copy.home.hero.sideTitle;
  const previewItems = copy.home.preview.items.slice(0, 3);
  const audienceLogicCopy = getLandingAudienceLogicCopy(landingLang);

  const SEO = {
    pt: {
      title: "prevIA | Inteligência para apostas com base estatística",
      description:
        "Teste grátis na landing, compare odds, entenda probabilidade e explore a leitura de preço, valor e contexto do prevIA.",
    },
    en: {
      title: "prevIA | Betting intelligence with statistical grounding",
      description:
        "Try prevIA for free on the landing page, compare odds, understand probability, and explore price, value, and context more clearly.",
    },
    es: {
      title: "prevIA | Inteligencia para apuestas con base estadística",
      description:
        "Prueba prevIA gratis en la landing, compara cuotas, entiende la probabilidad y explora precio, valor y contexto con más claridad.",
    },
  } as const;

  usePublicSeo({
    lang: currentLang,
    path: `/${currentLang}`,
    title: SEO[currentLang].title,
    description: SEO[currentLang].description,
  });

  return (
    <div className="landing-page">
      <section className="public-hero public-hero-compact-top">
        <div className="public-hero-card public-hero-card-split">
          <div className="public-hero-main">
            <div className="public-eyebrow">{copy.home.hero.eyebrow}</div>
            <h1 className="public-title">{copy.home.hero.title}</h1>
            <p className="public-body">{copy.home.hero.body}</p>

            <div className="landing-chip-row landing-chip-row-hero">
              {copy.home.trustBar.map((item, index) => (
                <span key={item} className="landing-chip landing-chip-with-icon">
                  <span className="landing-chip-icon" aria-hidden="true">
                    <LandingHeroIcon name={HERO_TRUST_ICONS[index] ?? "chart"} />
                  </span>
                  {item}
                </span>
              ))}
            </div>

            <div className="landing-league-coverage-card">
              <div className="landing-league-coverage-copy">
                <span className="landing-league-coverage-kicker">
                  {leagueCoverageCopy.kicker}
                </span>
                <strong>{leagueCoverageTitle}</strong>
                <p>{leagueCoverageCopy.summary}</p>
              </div>

              <button
                type="button"
                className="landing-league-coverage-link"
                onClick={() => setIsLeagueCoverageModalOpen(true)}
              >
                {leagueCoverageCopy.button}
              </button>
            </div>

            <div className="public-actions">
              {showPublicFreeAnon ? (
                <a href="#teste-gratis" className="public-btn public-btn-primary">
                  {copy.home.hero.primaryCta}
                </a>
              ) : (
                <Link to={`/${currentLang}/glossary`} className="public-btn public-btn-primary">
                  {copy.home.hero.primaryCta}
                </Link>
              )}

              <Link to={`/${currentLang}/how-it-works`} className="public-btn public-btn-secondary">
                {copy.home.hero.secondaryCta}
              </Link>
            </div>

            <div className="public-hero-microcopy">
              <span aria-hidden="true">◇</span>
              {copy.home.hero.microcopy}
            </div>
          </div>

          <aside
            className="public-hero-sidecard public-hero-product-card"
            aria-label={copy.home.hero.sideTitle}
          >
            <div className="public-hero-sidecard-kicker">
              <span aria-hidden="true">↗</span>
              {copy.home.hero.sideKicker}
            </div>
            <div className="public-hero-sidecard-title">{copy.home.hero.sideTitle}</div>

            <div className="public-hero-visual-stage">
              <img
                src={heroProductPreviewImg}
                alt={heroVisualTitle}
                className="public-hero-visual-image"
                loading="eager"
              />
            </div>

            <div className="public-hero-feature-grid" aria-label={copy.home.hero.sideTitle}>
              {copy.home.hero.sideFeatures.map((feature, index) => (
                <div key={feature.title} className="public-hero-feature-card">
                  <span className="public-hero-feature-icon" aria-hidden="true">
                    <LandingHeroIcon name={HERO_FEATURE_ICONS[index] ?? "odds"} />
                  </span>
                  <span>
                    <strong>{feature.title}</strong>
                    <small>{feature.body}</small>
                  </span>
                </div>
              ))}
            </div>

            <p className="public-hero-sidecard-body">{copy.home.hero.sideBody}</p>
          </aside>
        </div>
      </section>

      {showPublicFreeAnon ? (
        <section className="landing-section landing-freeanon-highlight" id="teste-gratis">
          <div className="landing-freeanon-highlight-shell">
            <PublicFreeAnonEmbed
              lang={currentLang}
              eyebrow={copy.home.freeAnonEmbed.eyebrow}
              title={copy.home.freeAnonEmbed.title}
              body={copy.home.freeAnonEmbed.body}
            />
          </div>
        </section>
      ) : null}

      <section className="landing-section landing-plans-section" id="planos-beneficios">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.home.plans.eyebrow}</div>
          <h2 className="landing-section-title">{copy.home.plans.title}</h2>
          <p className="landing-section-body">{copy.home.plans.body}</p>
        </div>

        <div className="landing-plan-summary-shell">
          {/*
            Card "Plano em foco" preservado para possível reativação futura.

            <div className="landing-plan-selected-summary">
              <div className="landing-plan-selected-kicker">{copy.home.plans.selectedLabel}</div>
              <div className="landing-plan-selected-title">{selectedPlanCard.title}</div>

              <div
                className={`landing-plan-selected-price${
                  selectedPlanPricing.isFree ? " is-free" : ""
                }`}
              >
                <div className="landing-plan-selected-price-amount">{selectedPlanPricing.amount}</div>
                <div className="landing-plan-selected-price-note">{selectedPlanPricing.note}</div>
              </div>

              <div className="landing-plan-selected-body">{selectedPlanCard.body}</div>

              <div className="landing-plan-selected-meta">
                {selectedPlanMetaItems.map((meta) => (
                  <span key={`selected-${meta}`} className="landing-plan-selected-meta-chip">
                    {meta}
                  </span>
                ))}
              </div>

              <div className="landing-plan-free-bridge">{freeFlowCopy.summary}</div>
            </div>
          */}

          <div className="landing-plan-controls-panel">
            <div className="landing-plan-controls">
              <div className="landing-plan-control-group">
                <span className="landing-plan-control-label">{pricingCopy.currencyLabel}</span>

                <div className="landing-plan-toggle" role="group" aria-label={pricingCopy.currencyLabel}>
                  {PRICING_CURRENCIES.map((currency) => (
                    <button
                      key={currency}
                      type="button"
                      className={`landing-plan-toggle-btn${
                        displayCurrency === currency ? " is-active" : ""
                      }`}
                      aria-pressed={displayCurrency === currency}
                      onClick={() => setDisplayCurrency(currency)}
                    >
                      {pricingCopy.currencyOptions[currency]}
                    </button>
                  ))}
                </div>
              </div>

              <div className="landing-plan-control-group">
                <span className="landing-plan-control-label">{pricingCopy.billingLabel}</span>

                <div className="landing-plan-toggle" role="group" aria-label={pricingCopy.billingLabel}>
                  {BILLING_CYCLES.map((cycle) => (
                    <button
                      key={cycle}
                      type="button"
                      className={`landing-plan-toggle-btn${
                        billingCycle === cycle ? " is-active" : ""
                      }`}
                      aria-pressed={billingCycle === cycle}
                      onClick={() => setBillingCycle(cycle)}
                    >
                      {pricingCopy.billingOptions[cycle]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="landing-plans-grid">
          {landingPlans.map((item) => {
            const planId = normalizePlanId(item.planId);
            const isSelected = selectedLandingPlan === planId;
            const metaItems = buildLandingPlanMeta(planId, landingLang);
            const pricePresentation = getLandingPlanPricePresentation(
              planId,
              displayCurrency,
              billingCycle,
              landingLang,
              showPublicFreeAnon,
            );

            const ctaHref =
              planId === "FREE"
                ? showPublicFreeAnon
                  ? "#teste-gratis"
                  : "/app"
                : "/app/account";

            return (
              <article
                key={item.planId}
                className={`landing-plan-card${item.recommended ? " is-recommended" : ""}${
                  isSelected ? " is-selected" : ""
                }`}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedLandingPlan(planId)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedLandingPlan(planId);
                  }
                }}
              >
                <div className="landing-plan-topline">
                  <span className="landing-plan-badge">{item.badge}</span>
                  <div className="landing-plan-topline-right">
                    {item.recommended ? (
                      <span className="landing-plan-highlight">
                        {copy.home.plans.recommendedLabel}
                      </span>
                    ) : null}
                  </div>
                </div>

                <h3 className="landing-plan-name">{item.title}</h3>

                <div
                  className={`landing-plan-price-block${
                    pricePresentation.isFree ? " is-free" : ""
                  }`}
                >
                  <div className="landing-plan-price-amount">{pricePresentation.amount}</div>
                  <div className="landing-plan-price-note">{pricePresentation.note}</div>
                </div>

                <p className="landing-plan-body">
                  {planId === "FREE" ? freeFlowCopy.card : item.body}
                </p>

                <div className="landing-plan-meta">
                  {metaItems.map((meta) => (
                    <span key={`${item.planId}-${meta}`} className="landing-plan-meta-chip">
                      {meta}
                    </span>
                  ))}
                </div>

                <ul className="landing-plan-list">
                  {item.bullets.map((bullet) => (
                    <li key={bullet}>{bullet}</li>
                  ))}
                </ul>

                {planId === "FREE" && showPublicFreeAnon ? (
                  <a
                    href={ctaHref}
                    className="landing-plan-cta"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    {item.cta}
                  </a>
                ) : (
                  <Link
                    to={ctaHref}
                    className="landing-plan-cta"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    {item.cta}
                  </Link>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="landing-section landing-audience-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.home.audience.eyebrow}</div>
          <h2 className="landing-section-title">{copy.home.audience.title}</h2>
        </div>

        <div className="landing-audience-layout">
          <div className="landing-audience-panel landing-audience-panel-positive">
            <div className="landing-audience-panel-head landing-audience-panel-head-row">
              <h3 className="landing-audience-panel-title">{copy.home.audience.forTitle}</h3>
              <span className="landing-audience-panel-pill">{audienceLogicCopy.panelPill}</span>
            </div>

            <div className="landing-audience-grid">
              {copy.home.audience.items.map((item, index) => (
                <article key={item.title} className="landing-audience-card">
                  <span className="landing-audience-card-icon" aria-hidden="true">
                    <LandingHeroIcon name={LANDING_AUDIENCE_CARD_ICONS[index] ?? "target"} />
                  </span>
                  <span className="landing-audience-badge">{item.badge}</span>
                  <h4 className="landing-audience-card-title">{item.title}</h4>
                  <p className="landing-audience-card-body">{item.body}</p>
                </article>
              ))}
            </div>

            <div className="landing-audience-logic-card" aria-label={audienceLogicCopy.logicTitle}>
              <div className="landing-audience-logic-main">
                <div className="landing-audience-logic-title">{audienceLogicCopy.logicTitle}</div>

                <div className="landing-audience-logic-flow">
                  {audienceLogicCopy.logicSteps.map((step, index) => (
                    <React.Fragment key={step}>
                      <span className="landing-audience-logic-step">
                        <span className="landing-audience-logic-icon" aria-hidden="true">
                          <LandingHeroIcon
                            name={LANDING_AUDIENCE_LOGIC_ICONS[index] ?? "odds"}
                          />
                        </span>
                        <span>{step}</span>
                      </span>

                      {index < audienceLogicCopy.logicSteps.length - 1 ? (
                        <span className="landing-audience-logic-arrow" aria-hidden="true">
                          →
                        </span>
                      ) : null}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              <div className="landing-audience-logic-example">
                <div className="landing-audience-logic-example-title">
                  {audienceLogicCopy.exampleTitle}
                </div>

                <div className="landing-audience-logic-match">
                  <span>
                    <strong>{audienceLogicCopy.homeLabel}</strong>
                    <small>1.92 · 54%</small>
                  </span>
                  <span className="landing-audience-logic-vs">vs</span>
                  <span>
                    <strong>{audienceLogicCopy.awayLabel}</strong>
                    <small>2.30 · 46%</small>
                  </span>
                </div>

                <div className="landing-audience-logic-bar" aria-hidden="true">
                  <span />
                </div>

                <small className="landing-audience-logic-fair-price">
                  {audienceLogicCopy.fairPrice}
                </small>
              </div>
            </div>
          </div>

          <aside className="landing-audience-panel landing-audience-panel-caution">
            <div className="landing-audience-panel-head">
              <h3 className="landing-audience-panel-title">{copy.home.audience.notForTitle}</h3>
            </div>

            <ul className="landing-audience-caution-list">
              {copy.home.audience.cautionItems.map((item) => (
                <li key={item}>
                  <span className="landing-audience-caution-icon" aria-hidden="true">
                    ×
                  </span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="landing-audience-note">
              <span className="landing-audience-note-icon" aria-hidden="true">
                ◇
              </span>

              <div>
                <div className="landing-audience-note-title">{copy.home.audience.noteTitle}</div>
                <p className="landing-audience-note-body">{copy.home.audience.noteBody}</p>
              </div>
            </div>
          </aside>
        </div>
      </section>

      <section className="landing-section landing-preview-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.home.preview.eyebrow}</div>
          <h2 className="landing-section-title">{copy.home.preview.title}</h2>
          <p className="landing-section-body">{copy.home.preview.body}</p>
        </div>

        <div className="landing-preview-grid">
          {previewItems.map((item, index) => {
            const imageSrc = PREVIEW_IMAGES[index];

            return (
              <article key={item.title} className="landing-preview-card">
                <div className="landing-preview-frame">
                  <div className="landing-preview-media">
                    {imageSrc ? (
                      <img
                        src={imageSrc}
                        alt={item.title}
                        className="landing-preview-image"
                        loading="lazy"
                      />
                    ) : (
                      <div className="landing-preview-placeholder">{item.badge}</div>
                    )}
                  </div>
                </div>

                <div className="landing-preview-kicker">{item.badge}</div>
                <h3 className="landing-card-title">{item.title}</h3>
                <p className="landing-card-body">{item.body}</p>
              </article>
            );
          })}
        </div>
      </section>
                      
        <section className="landing-section landing-howitworks-teaser-section">
          <div className="landing-howitworks-teaser-shell">
            <div className="landing-howitworks-teaser-copy">
              <div className="public-eyebrow">{copy.home.howItWorks.eyebrow}</div>
              <h2 className="landing-section-title">{copy.home.howItWorks.title}</h2>
              <p className="landing-section-body">{copy.home.howItWorks.body}</p>

              <Link
                to={`/${currentLang}/how-it-works`}
                className="landing-howitworks-teaser-cta"
              >
                {copy.home.howItWorks.cta}
              </Link>
            </div>

            <div className="landing-howitworks-teaser-steps">
              {copy.home.howItWorks.steps.map((item) => (
                <article key={item.step} className="landing-howitworks-teaser-card">
                  <div className="landing-howitworks-teaser-step">{item.step}</div>
                  <h3 className="landing-card-title">{item.title}</h3>
                  <p className="landing-card-body">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

      <div id="novidades">
        <BetaLeadForm lang={currentLang} />
      </div>

      <section className="landing-final-cta">
        <div className="landing-final-cta-card">
          <div className="landing-final-cta-main">
            <div className="public-eyebrow">{copy.home.finalCta.eyebrow}</div>
            <h2 className="landing-final-cta-title">{copy.home.finalCta.title}</h2>
            <p className="landing-final-cta-body">{copy.home.finalCta.body}</p>

            <div className="public-actions">
              <Link to="/app" className="public-btn public-btn-primary">
                {copy.home.finalCta.primaryCta}
              </Link>

              {showPublicFreeAnon ? (
                <a href="#teste-gratis" className="public-btn public-btn-secondary">
                  {copy.home.finalCta.secondaryCta}
                </a>
              ) : (
                <Link to={`/${currentLang}/glossary`} className="public-btn public-btn-secondary">
                  {copy.home.finalCta.secondaryCta}
                </Link>
              )}
            </div>
          </div>

          <aside className="landing-final-cta-side">
            <div className="landing-final-cta-points">
              {copy.home.finalCta.points.map((item) => (
                <div key={item} className="landing-final-cta-point">
                  <span className="landing-final-cta-point-dot" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>

            <div className="landing-final-cta-note">{copy.home.finalCta.note}</div>
          </aside>
        </div>
      </section>

      {isLeagueCoverageModalOpen ? (
        <div
          className="landing-league-modal-backdrop"
          role="presentation"
          onMouseDown={() => setIsLeagueCoverageModalOpen(false)}
        >
          <div
            className="um-modal landing-league-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="landing-league-modal-title"
            aria-describedby="landing-league-modal-body"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="product-modal-head">
              <div className="product-modal-head-copy">
                <span className="product-modal-kicker">{leagueCoverageCopy.kicker}</span>
                <div id="landing-league-modal-title" className="product-modal-title">
                  {leagueCoverageCopy.modalTitle}
                </div>
                <div id="landing-league-modal-body" className="product-modal-subtitle">
                  {leagueCoverageCopy.modalBody}
                </div>
              </div>

              <button
                type="button"
                className="product-modal-close"
                aria-label={leagueCoverageCopy.modalCloseLabel}
                onClick={() => setIsLeagueCoverageModalOpen(false)}
              >
                ×
              </button>
            </div>

            <div className="product-modal-body">
              {leagueCoverageLoading && leagueCoverageItems.length === 0 ? (
                <p className="landing-league-modal-status">{leagueCoverageCopy.loading}</p>
              ) : null}

              {leagueCoverageError && leagueCoverageItems.length === 0 ? (
                <p className="landing-league-modal-status landing-league-modal-status-error">
                  {leagueCoverageCopy.error}
                </p>
              ) : null}

              {!leagueCoverageLoading &&
              !leagueCoverageError &&
              leagueCoverageItems.length === 0 ? (
                <p className="landing-league-modal-status">{leagueCoverageCopy.empty}</p>
              ) : null}

              {leagueCoverageGroups.length > 0 ? (
                <div className="landing-league-modal-groups">
                  {leagueCoverageGroups.map((group) => (
                    <section key={group.key} className="landing-league-modal-group">
                      <h3>{group.label}</h3>

                      <div className="landing-league-modal-list">
                        {group.items.map((item) => (
                          <div key={`${group.key}-${item.key}`} className="landing-league-modal-item">
                            <span>{item.name}</span>
                            {item.country ? <small>{item.country}</small> : null}
                          </div>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}