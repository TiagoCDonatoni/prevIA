import type { Lang } from "../i18n";

export type BettorProfileId = "recreativo" | "profissional" | "criador";
export type AccountNarrativeStyleId = "leve" | "equilibrado" | "pro";

export type ProductAccountPreferences = {
  bettor_profile: BettorProfileId | null;
  narrative_style: AccountNarrativeStyleId;
  completed_onboarding: boolean;
};

type Localized<T> = {
  pt: T;
  en: T;
  es: T;
};

export type BettorProfileCardCopy = {
  id: BettorProfileId;
  title: string;
  description: string;
  bullets: string[];
};

export const DEFAULT_ACCOUNT_PREFERENCES: ProductAccountPreferences = {
  bettor_profile: null,
  narrative_style: "leve",
  completed_onboarding: false,
};

const VALID_BETTOR_PROFILES: BettorProfileId[] = ["recreativo", "profissional", "criador"];
const VALID_NARRATIVE_STYLES: AccountNarrativeStyleId[] = ["leve", "equilibrado", "pro"];

function pick<T>(lang: Lang, map: Localized<T>): T {
  if (lang === "en") return map.en;
  if (lang === "es") return map.es;
  return map.pt;
}

export function narrativeStyleFromBettorProfile(
  profile: BettorProfileId | null | undefined
): AccountNarrativeStyleId {
  if (profile === "profissional") return "equilibrado";
  if (profile === "criador") return "pro";
  return "leve";
}

export function resolveAccountPreferences(
  raw?: Partial<ProductAccountPreferences> | null
): ProductAccountPreferences {
  const bettor_profile = VALID_BETTOR_PROFILES.includes(raw?.bettor_profile as BettorProfileId)
    ? (raw?.bettor_profile as BettorProfileId)
    : null;

  const narrative_style = VALID_NARRATIVE_STYLES.includes(
    raw?.narrative_style as AccountNarrativeStyleId
  )
    ? (raw?.narrative_style as AccountNarrativeStyleId)
    : narrativeStyleFromBettorProfile(bettor_profile);

  return {
    bettor_profile,
    narrative_style,
    completed_onboarding: Boolean(raw?.completed_onboarding),
  };
}

export function getBettorProfileCards(lang: Lang): BettorProfileCardCopy[] {
  return [
    {
      id: "recreativo",
      title: pick(lang, {
        pt: "Recreativo",
        en: "Casual",
        es: "Recreativo",
      }),
      description: pick(lang, {
        pt: "Para quem aposta mais por diversão e prefere uma leitura mais leve.",
        en: "For people who bet more for fun and prefer a lighter read.",
        es: "Para quien apuesta más por diversión y prefiere una lectura más ligera.",
      }),
      bullets: pick(lang, {
        pt: [
          "Aposto mais para entretenimento",
          "Prefiro explicações simples e diretas",
          "Não preciso de tanto tecnicismo",
        ],
        en: [
          "I bet more for entertainment",
          "I prefer simple and direct explanations",
          "I do not need that much technical detail",
        ],
        es: [
          "Apuesto más por entretenimiento",
          "Prefiero explicaciones simples y directas",
          "No necesito tanto tecnicismo",
        ],
      }),
    },
    {
      id: "profissional",
      title: pick(lang, {
        pt: "Profissional",
        en: "Professional",
        es: "Profesional",
      }),
      description: pick(lang, {
        pt: "Para quem trata as entradas com mais método e quer uma leitura mais estruturada.",
        en: "For people who approach betting more methodically and want a more structured read.",
        es: "Para quien trata sus apuestas con más método y quiere una lectura más estructurada.",
      }),
      bullets: pick(lang, {
        pt: [
          "Levo as entradas mais a sério",
          "Gosto de entender melhor os números",
          "Prefiro uma análise mais organizada",
        ],
        en: [
          "I take my bets more seriously",
          "I like understanding the numbers better",
          "I prefer a more organized analysis",
        ],
        es: [
          "Me tomo mis apuestas más en serio",
          "Me gusta entender mejor los números",
          "Prefiero un análisis más organizado",
        ],
      }),
    },
    {
      id: "criador",
      title: pick(lang, {
        pt: "Criador / Tipster",
        en: "Creator / Tipster",
        es: "Creador / Tipster",
      }),
      description: pick(lang, {
        pt: "Para quem cria conteúdo, compartilha picks e gosta de uma leitura mais refinada.",
        en: "For people who create content, share picks, and like a more refined read.",
        es: "Para quien crea contenido, comparte picks y le gusta una lectura más refinada.",
      }),
      bullets: pick(lang, {
        pt: [
          "Crio conteúdo ou compartilho análises",
          "Quero uma leitura mais refinada",
          "Gosto de um discurso mais completo",
        ],
        en: [
          "I create content or share analysis",
          "I want a more refined read",
          "I like a more complete explanation",
        ],
        es: [
          "Creo contenido o comparto análisis",
          "Quiero una lectura más refinada",
          "Me gusta una explicación más completa",
        ],
      }),
    },
  ];
}

export function mapBettorProfileLabel(
  lang: Lang,
  profile: BettorProfileId | null | undefined
): string {
  if (!profile) {
    return pick(lang, {
      pt: "Ainda não definido",
      en: "Not set yet",
      es: "Aún no definido",
    });
  }

  if (profile === "profissional") {
    return pick(lang, {
      pt: "Profissional",
      en: "Professional",
      es: "Profesional",
    });
  }

  if (profile === "criador") {
    return pick(lang, {
      pt: "Criador / Tipster",
      en: "Creator / Tipster",
      es: "Creador / Tipster",
    });
  }

  return pick(lang, {
    pt: "Recreativo",
    en: "Casual",
    es: "Recreativo",
  });
}

export function mapNarrativeStyleLabel(
  lang: Lang,
  style: AccountNarrativeStyleId | null | undefined
): string {
  const value = VALID_NARRATIVE_STYLES.includes(style as AccountNarrativeStyleId)
    ? (style as AccountNarrativeStyleId)
    : "leve";

  if (value === "equilibrado") {
    return pick(lang, {
      pt: "Equilibrado",
      en: "Balanced",
      es: "Equilibrado",
    });
  }

  if (value === "pro") {
    return pick(lang, {
      pt: "Pro",
      en: "Pro",
      es: "Pro",
    });
  }

  return pick(lang, {
    pt: "Leve",
    en: "Light",
    es: "Ligero",
  });
}