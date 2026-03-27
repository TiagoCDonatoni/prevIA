export type ProductLang = "pt" | "en" | "es";

export type LeagueCatalogEntry = {
  countryCode: string;
  countryNames: Record<ProductLang, string>;
  leagueNames: Record<ProductLang, string>;
  sortOrder?: number;
  tier?: number;
};

export const LEAGUE_CATALOG: Record<string, LeagueCatalogEntry> = {
  soccer_brazil_campeonato: {
    countryCode: "BR",
    countryNames: {
      pt: "Brasil",
      en: "Brazil",
      es: "Brasil",
    },
    leagueNames: {
      pt: "Brasileirão Série A",
      en: "Brazil Serie A",
      es: "Brasileirão Serie A",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_epl: {
    countryCode: "EN",
    countryNames: {
      pt: "Inglaterra",
      en: "England",
      es: "Inglaterra",
    },
    leagueNames: {
      pt: "Premier League",
      en: "Premier League",
      es: "Premier League",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_efl_champ: {
    countryCode: "EN",
    countryNames: {
      pt: "Inglaterra",
      en: "England",
      es: "Inglaterra",
    },
    leagueNames: {
      pt: "Championship",
      en: "Championship",
      es: "Championship",
    },
    sortOrder: 20,
    tier: 2,
  },

  soccer_germany_bundesliga: {
    countryCode: "DE",
    countryNames: {
      pt: "Alemanha",
      en: "Germany",
      es: "Alemania",
    },
    leagueNames: {
      pt: "Bundesliga",
      en: "Bundesliga",
      es: "Bundesliga",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_germany_bundesliga2: {
    countryCode: "DE",
    countryNames: {
      pt: "Alemanha",
      en: "Germany",
      es: "Alemania",
    },
    leagueNames: {
      pt: "2. Bundesliga",
      en: "2. Bundesliga",
      es: "2. Bundesliga",
    },
    sortOrder: 20,
    tier: 2,
  },

  soccer_germany_liga3: {
    countryCode: "DE",
    countryNames: {
      pt: "Alemanha",
      en: "Germany",
      es: "Alemania",
    },
    leagueNames: {
      pt: "3. Liga",
      en: "3. Liga",
      es: "3. Liga",
    },
    sortOrder: 30,
    tier: 3,
  },

  soccer_spain_laliga: {
    countryCode: "ES",
    countryNames: {
      pt: "Espanha",
      en: "Spain",
      es: "España",
    },
    leagueNames: {
      pt: "La Liga",
      en: "La Liga",
      es: "La Liga",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_spain_copa_del_rey: {
    countryCode: "ES",
    countryNames: {
      pt: "Espanha",
      en: "Spain",
      es: "España",
    },
    leagueNames: {
      pt: "Copa do Rei",
      en: "Copa del Rey",
      es: "Copa del Rey",
    },
    sortOrder: 40,
    tier: 1,
  },

  soccer_italy_serie_a: {
    countryCode: "IT",
    countryNames: {
      pt: "Itália",
      en: "Italy",
      es: "Italia",
    },
    leagueNames: {
      pt: "Serie A",
      en: "Serie A",
      es: "Serie A",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_australia_aleague: {
    countryCode: "AU",
    countryNames: {
      pt: "Austrália",
      en: "Australia",
      es: "Australia",
    },
    leagueNames: {
      pt: "A-League",
      en: "A-League",
      es: "A-League",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_sweden_allsvenskan: {
    countryCode: "SE",
    countryNames: {
      pt: "Suécia",
      en: "Sweden",
      es: "Suecia",
    },
    leagueNames: {
      pt: "Allsvenskan",
      en: "Allsvenskan",
      es: "Allsvenskan",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_austria_bundesliga: {
    countryCode: "AT",
    countryNames: {
      pt: "Áustria",
      en: "Austria",
      es: "Austria",
    },
    leagueNames: {
      pt: "Bundesliga Austríaca",
      en: "Austrian Bundesliga",
      es: "Bundesliga de Austria",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_belgium_first_div: {
    countryCode: "BE",
    countryNames: {
      pt: "Bélgica",
      en: "Belgium",
      es: "Bélgica",
    },
    leagueNames: {
      pt: "Primeira Divisão da Bélgica",
      en: "Belgium First Division",
      es: "Primera División de Bélgica",
    },
    sortOrder: 10,
    tier: 1,
  },

  soccer_conmebol_copa_libertadores: {
    countryCode: "CONMEBOL",
    countryNames: {
      pt: "América do Sul",
      en: "South America",
      es: "Sudamérica",
    },
    leagueNames: {
      pt: "Copa Libertadores",
      en: "Copa Libertadores",
      es: "Copa Libertadores",
    },
    sortOrder: 10,
    tier: 1,
  },
};