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
    definition: "O que é",
    example: "Exemplo",
    productNote: "Como o prevIA usa esse conceito",
    faq: "Perguntas frequentes",
    related: "Termos relacionados",
    readTerm: "Ler termo",
    ctaTitle: "Quer ver esse conceito aplicado em jogos reais?",
    ctaBody:
      "O prevIA organiza odds, probabilidade estimada, preço justo e leitura de valor para apoiar sua própria análise.",
    ctaButton: "Conhecer o prevIA",
  },
  en: {
    back: "Back to glossary",
    definition: "What it means",
    example: "Example",
    productNote: "How prevIA uses this concept",
    faq: "Frequently asked questions",
    related: "Related terms",
    readTerm: "Read term",
    ctaTitle: "Want to see this concept applied to real matches?",
    ctaBody:
      "prevIA organizes odds, estimated probability, fair price, and value reading to support your own analysis.",
    ctaButton: "Explore prevIA",
  },
  es: {
    back: "Volver al glosario",
    definition: "Qué significa",
    example: "Ejemplo",
    productNote: "Cómo prevIA usa este concepto",
    faq: "Preguntas frecuentes",
    related: "Términos relacionados",
    readTerm: "Leer término",
    ctaTitle: "¿Quieres ver este concepto aplicado a partidos reales?",
    ctaBody:
      "prevIA organiza cuotas, probabilidad estimada, precio justo y lectura de valor para apoyar tu propio análisis.",
    ctaButton: "Conocer prevIA",
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
    title:
      term?.seoTitle ??
      (term
        ? currentLang === "pt"
          ? `${term.term} | Glossário prevIA`
          : currentLang === "en"
            ? `${term.term} | prevIA Glossary`
            : `${term.term} | Glosario prevIA`
        : currentLang === "pt"
          ? "Glossário prevIA"
          : currentLang === "en"
            ? "prevIA Glossary"
            : "Glosario prevIA"),
    description: term?.seoDescription ?? term?.shortDef ?? "",
  });

  if (!term) {
    return <Navigate to={`/${currentLang}/glossary`} replace />;
  }

  const labels = GLOSSARY_CATEGORY_LABELS[currentLang];
  const sections = term.sections ?? [];
  const faq = term.faq ?? [];
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
        <h2 className="glossary-term-section-title">{copy.definition}</h2>
        <div className="glossary-term-richtext">
          <p>{term.fullDef}</p>
          {term.intro ? <p>{term.intro}</p> : null}
        </div>
      </section>

      {sections.map((section) => (
        <section key={section.title} className="glossary-term-section">
          <h2 className="glossary-term-section-title">{section.title}</h2>
          <div className="glossary-term-richtext">
            {section.body.map((paragraph, index) => (
              <p key={`${section.title}-${index}`}>{paragraph}</p>
            ))}
          </div>
        </section>
      ))}

      {term.example ? (
        <section className="glossary-term-section">
          <h2 className="glossary-term-section-title">{copy.example}</h2>
          <div className="glossary-example-card">{term.example}</div>
        </section>
      ) : null}

      {term.productNote ? (
        <section className="glossary-term-section">
          <h2 className="glossary-term-section-title">{copy.productNote}</h2>
          <div className="glossary-product-note">
            <p>{term.productNote}</p>
          </div>
        </section>
      ) : null}

      {faq.length ? (
        <section className="glossary-term-section">
          <h2 className="glossary-term-section-title">{copy.faq}</h2>
          <div className="glossary-faq-list">
            {faq.map((item) => (
              <div key={item.question} className="glossary-faq-item">
                <h3 className="glossary-faq-question">{item.question}</h3>
                <p className="glossary-faq-answer">{item.answer}</p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="glossary-term-cta">
        <div>
          <h2 className="glossary-term-cta-title">{copy.ctaTitle}</h2>
          <p className="glossary-term-cta-body">{copy.ctaBody}</p>
        </div>

        <Link to={`/${currentLang}`} className="public-btn public-btn-primary">
          {copy.ctaButton}
        </Link>
      </section>

      {related.length ? (
        <section className="glossary-term-section glossary-related-section">
          <div className="glossary-related-heading">
            <h2 className="glossary-term-section-title">{copy.related}</h2>
          </div>

          <div className="glossary-grid glossary-related-grid">
            {related.map((item) => (
              <Link
                key={item!.id}
                to={`/${currentLang}/glossary/${item!.slug}`}
                className="glossary-card glossary-card-linkbox glossary-related-card"
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