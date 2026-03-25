import React from "react";
import { useParams } from "react-router-dom";

import { getAboutCopy } from "../content/aboutCopy";
import { coercePublicLang } from "../lib/publicLang";
import { usePublicSeo } from "../lib/publicSeo";

const SEO = {
  pt: {
    title: "Sobre o prevIA | Inteligência aplicada a apostas esportivas",
    description:
      "Conheça a proposta do prevIA: transformar dados, probabilidades e leitura de mercado em inteligência prática para apostas esportivas.",
  },
  en: {
    title: "About prevIA | Applied intelligence for sports betting",
    description:
      "Learn the proposal behind prevIA: turning data, probabilities, and market reading into practical intelligence for sports betting.",
  },
  es: {
    title: "Sobre prevIA | Inteligencia aplicada a apuestas deportivas",
    description:
      "Conoce la propuesta de prevIA: convertir datos, probabilidades y lectura de mercado en inteligencia práctica para apuestas deportivas.",
  },
} as const;

export function PublicAboutPage() {
  const { lang } = useParams<{ lang: string }>();
  const currentLang = coercePublicLang(lang);
  const copy = getAboutCopy(currentLang);

  usePublicSeo({
    lang: currentLang,
    path: `/${currentLang}/about`,
    title: SEO[currentLang].title,
    description: SEO[currentLang].description,
  });

  return (
    <section className="public-page public-about-page">
      <div className="public-hero-card public-about-hero">
        <div className="public-eyebrow">{copy.eyebrow}</div>
        <h1 className="public-page-title public-about-title">{copy.title}</h1>
        <p className="public-page-body public-about-intro">{copy.intro}</p>
      </div>

      <div className="public-about-grid">
        {copy.sections.map((section) => (
          <article key={section.title} className="public-info-card public-about-card">
            <h2 className="public-info-card-title">{section.title}</h2>

            <div className="public-about-copy">
              {section.paragraphs.map((paragraph) => (
                <p key={paragraph} className="public-page-body">
                  {paragraph}
                </p>
              ))}
            </div>
          </article>
        ))}
      </div>

      <div className="public-info-card public-about-highlight">
        <h2 className="public-info-card-title">{copy.highlight.title}</h2>
        <p className="public-page-body">{copy.highlight.body}</p>
      </div>
    </section>
  );
}