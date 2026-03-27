import React from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { usePublicSeo } from "../lib/publicSeo";

import { coercePublicLang } from "../lib/publicLang";
import {
  GLOSSARY_CATEGORY_LABELS,
  getGlossaryTermById,
  getGlossaryTermBySlug,
} from "../content/glossary/glossaryData";

const COPY = {
  pt: {
    back: "Voltar ao glossário",
    example: "Exemplo",
    related: "Termos relacionados",
    readTerm: "Ler termo",
  },
  en: {
    back: "Back to glossary",
    example: "Example",
    related: "Related terms",
    readTerm: "Read term",
  },
  es: {
    back: "Volver al glosario",
    example: "Ejemplo",
    related: "Términos relacionados",
    readTerm: "Leer término",
  },
} as const;

export function GlossaryTermPage() {
  const { lang, slug } = useParams<{ lang: string; slug: string }>();
  const currentLang = coercePublicLang(lang);
  const copy = COPY[currentLang];

  const term = slug ? getGlossaryTermBySlug(currentLang, slug) : null;

  usePublicSeo({
    lang: currentLang,
    path: term ? `/${currentLang}/glossary/${term.slug}` : `/${currentLang}/glossary`,
    title: term
      ? currentLang === "pt"
        ? `${term.term} | Glossário prevIA`
        : currentLang === "en"
          ? `${term.term} | prevIA Glossary`
          : `${term.term} | Glosario prevIA`
      : currentLang === "pt"
        ? "Glossário prevIA"
        : currentLang === "en"
          ? "prevIA Glossary"
          : "Glosario prevIA",
    description: term?.shortDef ?? "",
  });

  if (!term) {
    return <Navigate to={`/${currentLang}/glossary`} replace />;
  }

  const labels = GLOSSARY_CATEGORY_LABELS[currentLang];
  const related = (term.relatedIds ?? [])
    .map((id) => getGlossaryTermById(currentLang, id))
    .filter(Boolean);

  return (
    <article className="glossary-term-page">
      <Link to={`/${currentLang}/glossary`} className="glossary-back-link">
        {copy.back}
      </Link>

      <header className="glossary-term-hero">
        <span className="glossary-category-pill">{labels[term.category]}</span>
        <h1 className="glossary-term-title">{term.term}</h1>
        <p className="glossary-term-shortdef">{term.shortDef}</p>
      </header>

      <section className="glossary-term-section">
        <div className="glossary-term-richtext">
          <p>{term.fullDef}</p>
        </div>
      </section>

      {term.example ? (
        <section className="glossary-term-section">
          <h2 className="glossary-term-section-title">{copy.example}</h2>
          <div className="glossary-example-card">{term.example}</div>
        </section>
      ) : null}

      {related.length ? (
        <section className="glossary-term-section">
          <h2 className="glossary-term-section-title">{copy.related}</h2>
          <div className="glossary-grid">
            {related.map((item) => (
              <Link
                key={item!.id}
                to={`/${currentLang}/glossary/${item!.slug}`}
                className="glossary-card glossary-card-linkbox"
                aria-label={`${copy.readTerm}: ${item!.term}`}
              >
                <div className="glossary-card-top">
                  <span className="glossary-category-pill">
                    {labels[item!.category]}
                  </span>
                </div>

                <h3 className="glossary-card-title">{item!.term}</h3>
                <p className="glossary-card-body">{item!.shortDef}</p>
                <span className="glossary-card-link">{copy.readTerm}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : null}
    </article>
  );
}