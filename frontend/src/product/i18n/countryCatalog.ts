export type ProductLang = "pt" | "en" | "es";

export type CountryCatalogEntry = {
  code: string;
  names: Record<ProductLang, string>;
};

export const COUNTRY_CATALOG: CountryCatalogEntry[] = [
  { code: "AF", names: { pt: "Afeganistão", en: "Afghanistan", es: "Afganistán" } },
  { code: "AL", names: { pt: "Albânia", en: "Albania", es: "Albania" } },
  { code: "DE", names: { pt: "Alemanha", en: "Germany", es: "Alemania" } },
  { code: "SA", names: { pt: "Arábia Saudita", en: "Saudi Arabia", es: "Arabia Saudita" } },
  { code: "AR", names: { pt: "Argentina", en: "Argentina", es: "Argentina" } },
  { code: "AU", names: { pt: "Austrália", en: "Australia", es: "Australia" } },
  { code: "AT", names: { pt: "Áustria", en: "Austria", es: "Austria" } },
  { code: "BE", names: { pt: "Bélgica", en: "Belgium", es: "Bélgica" } },
  { code: "BO", names: { pt: "Bolívia", en: "Bolivia", es: "Bolivia" } },
  { code: "BR", names: { pt: "Brasil", en: "Brazil", es: "Brasil" } },
  { code: "BG", names: { pt: "Bulgária", en: "Bulgaria", es: "Bulgaria" } },
  { code: "CA", names: { pt: "Canadá", en: "Canada", es: "Canadá" } },
  { code: "CL", names: { pt: "Chile", en: "Chile", es: "Chile" } },
  { code: "CN", names: { pt: "China", en: "China", es: "China" } },
  { code: "CO", names: { pt: "Colômbia", en: "Colombia", es: "Colombia" } },
  { code: "KR", names: { pt: "Coreia do Sul", en: "South Korea", es: "Corea del Sur" } },
  { code: "HR", names: { pt: "Croácia", en: "Croatia", es: "Croacia" } },
  { code: "DK", names: { pt: "Dinamarca", en: "Denmark", es: "Dinamarca" } },
  { code: "EG", names: { pt: "Egito", en: "Egypt", es: "Egipto" } },
  { code: "EC", names: { pt: "Equador", en: "Ecuador", es: "Ecuador" } },
  { code: "SK", names: { pt: "Eslováquia", en: "Slovakia", es: "Eslovaquia" } },
  { code: "SI", names: { pt: "Eslovênia", en: "Slovenia", es: "Eslovenia" } },
  { code: "ES", names: { pt: "Espanha", en: "Spain", es: "España" } },
  { code: "US", names: { pt: "Estados Unidos", en: "United States", es: "Estados Unidos" } },
  { code: "EE", names: { pt: "Estônia", en: "Estonia", es: "Estonia" } },
  { code: "FI", names: { pt: "Finlândia", en: "Finland", es: "Finlandia" } },
  { code: "FR", names: { pt: "França", en: "France", es: "Francia" } },
  { code: "GR", names: { pt: "Grécia", en: "Greece", es: "Grecia" } },
  { code: "NL", names: { pt: "Holanda", en: "Netherlands", es: "Países Bajos" } },
  { code: "HU", names: { pt: "Hungria", en: "Hungary", es: "Hungría" } },
  { code: "IN", names: { pt: "Índia", en: "India", es: "India" } },
  { code: "IE", names: { pt: "Irlanda", en: "Ireland", es: "Irlanda" } },
  { code: "IS", names: { pt: "Islândia", en: "Iceland", es: "Islandia" } },
  { code: "IL", names: { pt: "Israel", en: "Israel", es: "Israel" } },
  { code: "IT", names: { pt: "Itália", en: "Italy", es: "Italia" } },
  { code: "JP", names: { pt: "Japão", en: "Japan", es: "Japón" } },
  { code: "MX", names: { pt: "México", en: "Mexico", es: "México" } },
  { code: "NO", names: { pt: "Noruega", en: "Norway", es: "Noruega" } },
  { code: "NZ", names: { pt: "Nova Zelândia", en: "New Zealand", es: "Nueva Zelanda" } },
  { code: "PY", names: { pt: "Paraguai", en: "Paraguay", es: "Paraguay" } },
  { code: "PE", names: { pt: "Peru", en: "Peru", es: "Perú" } },
  { code: "PL", names: { pt: "Polônia", en: "Poland", es: "Polonia" } },
  { code: "PT", names: { pt: "Portugal", en: "Portugal", es: "Portugal" } },
  { code: "GB", names: { pt: "Reino Unido", en: "United Kingdom", es: "Reino Unido" } },
  { code: "CZ", names: { pt: "República Tcheca", en: "Czech Republic", es: "República Checa" } },
  { code: "RO", names: { pt: "Romênia", en: "Romania", es: "Rumania" } },
  { code: "RS", names: { pt: "Sérvia", en: "Serbia", es: "Serbia" } },
  { code: "SE", names: { pt: "Suécia", en: "Sweden", es: "Suecia" } },
  { code: "CH", names: { pt: "Suíça", en: "Switzerland", es: "Suiza" } },
  { code: "TR", names: { pt: "Turquia", en: "Turkey", es: "Turquía" } },
  { code: "UA", names: { pt: "Ucrânia", en: "Ukraine", es: "Ucrania" } },
  { code: "UY", names: { pt: "Uruguai", en: "Uruguay", es: "Uruguay" } },
  { code: "VE", names: { pt: "Venezuela", en: "Venezuela", es: "Venezuela" } },

  // entidades úteis no futebol
  { code: "UEFA", names: { pt: "Europa", en: "Europe", es: "Europa" } },
  { code: "CONMEBOL", names: { pt: "América do Sul", en: "South America", es: "Sudamérica" } },
  { code: "CONCACAF", names: { pt: "América do Norte e Central", en: "North & Central America", es: "Norte y Centroamérica" } },
  { code: "AFC", names: { pt: "Ásia", en: "Asia", es: "Asia" } },
  { code: "CAF", names: { pt: "África", en: "Africa", es: "África" } },
  { code: "FIFA", names: { pt: "Internacional", en: "International", es: "Internacional" } },
];

export function getCountryNameByCode(code: string | null | undefined, lang: ProductLang): string {
  const normalized = String(code || "").trim().toUpperCase();
  if (!normalized) return "";
  const found = COUNTRY_CATALOG.find((item) => item.code === normalized);
  return found?.names?.[lang] ?? "";
}

export function getAdminCountryOptionsPt() {
  return COUNTRY_CATALOG
    .map((item) => ({
      code: item.code,
      label: item.names.pt,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}