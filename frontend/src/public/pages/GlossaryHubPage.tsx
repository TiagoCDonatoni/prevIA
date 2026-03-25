import React, { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { usePublicSeo } from "../lib/publicSeo";

import { coercePublicLang } from "../lib/publicLang";
import {
  GLOSSARY_CATEGORY_LABELS,
  getGlossaryTerms,
  type GlossaryCategory,
} from "../content/glossary/glossaryData";

const COPY = {
  pt: {
    title: "Glossário",
    body: "Termos essenciais sobre bets, odds, mercados, probabilidade, value e gestão de banca.",
    searchPlaceholder: "Buscar termo ou definição...",
    all: "Todos",
    empty: "Nenhum termo encontrado para esse filtro.",
    readTerm: "Ler termo",
  },
  en: {
    title: "Glossary",
    body: "Essential terms about betting, odds, markets, probability, value, and bankroll management.",
    searchPlaceholder: "Search term or definition...",
    all: "All",
    empty: "No terms found for this filter.",
    readTerm: "Read term",
  },
  es: {
    title: "Glosario",
    body: "Términos esenciales sobre apuestas, cuotas, mercados, probabilidad, value y gestión de banca.",
    searchPlaceholder: "Buscar término o definición...",
    all: "Todos",
    empty: "No se encontraron términos para este filtro.",
    readTerm: "Leer término",
  },
} as const;

const SEO = {
  pt: {
    title: "Glossário de Bets e Odds | prevIA",
    description:
      "Glossário multilíngue com termos essenciais sobre bets, odds, probabilidade, mercados e gestão de banca.",
  },
  en: {
    title: "Betting and Odds Glossary | prevIA",
    description:
      "Multilingual glossary with essential terms about betting, odds, probability, markets, and bankroll management.",
  },
  es: {
    title: "Glosario de Apuestas y Cuotas | prevIA",
    description:
      "Glosario multilingüe con términos esenciales sobre apuestas, cuotas, probabilidad, mercados y gestión de banca.",
  },
} as const;

export function GlossaryHubPage() {
  const { lang } = useParams<{ lang: string }>();
  const currentLang = coercePublicLang(lang);
  const copy = COPY[currentLang];
  const terms = getGlossaryTerms(currentLang);
  const labels = GLOSSARY_CATEGORY_LABELS[currentLang];

  usePublicSeo({
    lang: currentLang,
    path: `/${currentLang}/glossary`,
    title: SEO[currentLang].title,
    description: SEO[currentLang].description,
  });

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<GlossaryCategory | "all">("all");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return terms.filter((term) => {
      const matchesCategory = category === "all" ? true : term.category === category;
      const matchesQuery = !q
        ? true
        : `${term.term} ${term.shortDef} ${term.fullDef}`.toLowerCase().includes(q);

      return matchesCategory && matchesQuery;
    });
  }, [terms, query, category]);

  const categories = Object.keys(labels) as GlossaryCategory[];

  return (
    <section className="glossary-page">
      <div className="public-page-header">
        <h1 className="public-page-title">{copy.title}</h1>
        <p className="public-page-body">{copy.body}</p>
      </div>

      <div className="glossary-toolbar">
        <input
          className="glossary-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.searchPlaceholder}
        />

        <div className="glossary-filter-row">
          <button
            type="button"
            className={`glossary-filter-btn ${category === "all" ? "active" : ""}`}
            onClick={() => setCategory("all")}
          >
            {copy.all}
          </button>

          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={`glossary-filter-btn ${category === item ? "active" : ""}`}
              onClick={() => setCategory(item)}
            >
              {labels[item]}
            </button>
          ))}
        </div>
      </div>

      {filtered.length ? (
        <div className="glossary-grid">
          {filtered.map((term) => (
            <Link
              key={term.id}
              to={`/${currentLang}/glossary/${term.slug}`}
              className="glossary-card glossary-card-linkbox"
              aria-label={`${copy.readTerm}: ${term.term}`}
            >
              <div className="glossary-card-top">
                <span className="glossary-category-pill">{labels[term.category]}</span>
              </div>

              <h2 className="glossary-card-title">{term.term}</h2>
              <p className="glossary-card-body">{term.shortDef}</p>
              <span className="glossary-card-link">{copy.readTerm}</span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="public-info-card">
          <div className="public-info-card-body">{copy.empty}</div>
        </div>
      )}
    </section>
  );
}