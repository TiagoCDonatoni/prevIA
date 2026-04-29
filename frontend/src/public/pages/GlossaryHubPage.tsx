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
    eyebrow: "Glossário prevIA",
    title: "Aprenda os principais conceitos para analisar odds com mais clareza",
    body: "Um hub simples para entender bets, odds, mercados, probabilidade, value e gestão de banca antes de tomar decisões.",
    searchPlaceholder: "Buscar termo, mercado ou conceito...",
    all: "Todos",
    empty: "Nenhum termo encontrado para esse filtro.",
    readTerm: "Ler termo",
    termsLabel: "termos",
    categoriesLabel: "categorias",
    languagesLabel: "idiomas",
    searchLabel: "Buscar no glossário",
  },
  en: {
    eyebrow: "prevIA Glossary",
    title: "Learn the key concepts behind clearer odds analysis",
    body: "A simple hub to understand betting, odds, markets, probability, value, and bankroll management before making decisions.",
    searchPlaceholder: "Search term, market, or concept...",
    all: "All",
    empty: "No terms found for this filter.",
    readTerm: "Read term",
    termsLabel: "terms",
    categoriesLabel: "categories",
    languagesLabel: "languages",
    searchLabel: "Search the glossary",
  },
  es: {
    eyebrow: "Glosario prevIA",
    title: "Aprende los conceptos clave para analizar cuotas con más claridad",
    body: "Un hub simple para entender apuestas, cuotas, mercados, probabilidad, value y gestión de banca antes de tomar decisiones.",
    searchPlaceholder: "Buscar término, mercado o concepto...",
    all: "Todos",
    empty: "No se encontraron términos para este filtro.",
    readTerm: "Leer término",
    termsLabel: "términos",
    categoriesLabel: "categorías",
    languagesLabel: "idiomas",
    searchLabel: "Buscar en el glosario",
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

  const categories = Object.keys(labels) as GlossaryCategory[];
  const totalTerms = terms.length;
  const totalCategories = categories.length;
  const totalLanguages = 3;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();

    return terms.filter((term) => {
      const matchesCategory =
        category === "all" ? true : term.category === category;

      const searchableText = [
        term.term,
        term.shortDef,
        term.fullDef,
        term.intro,
        term.productNote,
        ...(term.sections ?? []).flatMap((section) => [
          section.title,
          ...section.body,
        ]),
        ...(term.faq ?? []).flatMap((item) => [item.question, item.answer]),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      const matchesQuery = !q ? true : searchableText.includes(q);

      return matchesCategory && matchesQuery;
    });
  }, [terms, query, category]);

  return (
    <section className="glossary-page">
      <div className="public-page-header glossary-main-hero">
        <span className="glossary-main-eyebrow">{copy.eyebrow}</span>

        <h1 className="public-page-title glossary-main-title">{copy.title}</h1>
        <p className="public-page-body glossary-main-body">{copy.body}</p>

        <div className="glossary-main-stats" aria-label="Resumo do glossário">
          <div className="glossary-main-stat">
            <strong>{totalTerms}</strong>
            <span>{copy.termsLabel}</span>
          </div>

          <div className="glossary-main-stat">
            <strong>{totalCategories}</strong>
            <span>{copy.categoriesLabel}</span>
          </div>

          <div className="glossary-main-stat">
            <strong>{totalLanguages}</strong>
            <span>{copy.languagesLabel}</span>
          </div>
        </div>
      </div>

      <div className="glossary-toolbar glossary-main-toolbar">
        <label className="glossary-search-shell">
          <span className="glossary-search-icon" aria-hidden="true">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <circle
                cx="11"
                cy="11"
                r="6"
                stroke="currentColor"
                strokeWidth="2"
              />
              <path
                d="M20 20L16.65 16.65"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <span className="sr-only">{copy.searchLabel}</span>

          <input
            className="glossary-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.searchPlaceholder}
          />
        </label>

        <div className="glossary-filter-row glossary-main-filter-row">
          <button
            type="button"
            className={`glossary-filter-btn ${
              category === "all" ? "active" : ""
            }`}
            onClick={() => setCategory("all")}
          >
            {copy.all}
          </button>

          {categories.map((item) => (
            <button
              key={item}
              type="button"
              className={`glossary-filter-btn glossary-filter-btn--${item} ${
                category === item ? "active" : ""
              }`}
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
              className={`glossary-card glossary-card-linkbox glossary-card--${term.category}`}
              aria-label={`${copy.readTerm}: ${term.term}`}
            >
              <div className="glossary-card-top">
                <span className="glossary-category-pill">
                  {labels[term.category]}
                </span>
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