import React from "react";
import { Link, useParams } from "react-router-dom";

import { coercePublicLang } from "../lib/publicLang";
import { usePublicSeo } from "../lib/publicSeo";
import { getHowItWorksCopy } from "../content/howItWorksCopy";

const SEO = {
  pt: {
    title: "Como funciona o prevIA | Dados, modelos e leitura de mercado",
    description:
      "Entenda como o prevIA combina dados esportivos, modelos probabilísticos e leitura de mercado para transformar informação complexa em análise prática.",
  },
  en: {
    title: "How prevIA works | Data, models, and market reading",
    description:
      "Understand how prevIA combines sports data, probabilistic models, and market reading to turn complex information into practical analysis.",
  },
  es: {
    title: "Cómo funciona prevIA | Datos, modelos y lectura de mercado",
    description:
      "Entiende cómo prevIA combina datos deportivos, modelos probabilísticos y lectura de mercado para convertir información compleja en análisis práctico.",
  },
} as const;

export function PublicHowItWorksPage() {
  const { lang } = useParams<{ lang: string }>();
  const currentLang = coercePublicLang(lang);
  const copy = getHowItWorksCopy(currentLang);

  const [openFaqIndex, setOpenFaqIndex] = React.useState<number>(0);

  usePublicSeo({
    lang: currentLang,
    path: `/${currentLang}/how-it-works`,
    title: SEO[currentLang].title,
    description: SEO[currentLang].description,
  });

  return (
    <div className="howitworks-page">
      <section className="public-hero">
        <div className="public-hero-card howitworks-hero-card">
          <div className="public-eyebrow">{copy.hero.eyebrow}</div>
          <h1 className="public-title">{copy.hero.title}</h1>
          <p className="public-body">{copy.hero.body}</p>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head">
          <div className="public-eyebrow">{copy.platform.eyebrow}</div>
          <h2 className="landing-section-title">{copy.platform.title}</h2>
          <p className="landing-section-body">{copy.platform.body}</p>
        </div>

        <div className="howitworks-layer-grid">
          {copy.platform.items.map((item) => (
            <article key={item.step} className="howitworks-layer-card">
              <div className="howitworks-layer-step">{item.step}</div>
              <h3 className="landing-card-title">{item.title}</h3>
              <p className="landing-card-body">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="howitworks-grid howitworks-grid-2">
          <article className="howitworks-card howitworks-card-stack">
            <div className="public-eyebrow">{copy.inputs.eyebrow}</div>
            <h2 className="howitworks-card-title">{copy.inputs.title}</h2>
            <p className="public-page-body">{copy.inputs.body}</p>

            <div className="howitworks-grid howitworks-grid-2-nested">
              {copy.inputs.items.map((item) => (
                <div key={item.title} className="howitworks-mini-card">
                  <h3 className="howitworks-mini-card-title">{item.title}</h3>
                  <p className="howitworks-mini-card-body">{item.body}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="howitworks-card howitworks-card-stack">
            <div className="public-eyebrow">{copy.models.eyebrow}</div>
            <h2 className="howitworks-card-title">{copy.models.title}</h2>
            <p className="public-page-body">{copy.models.body}</p>

            <ul className="howitworks-point-list">
              {copy.models.questions.map((item) => (
                <li key={item} className="howitworks-point-item">
                  <span className="howitworks-point-dot" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="howitworks-note">{copy.models.note}</div>
          </article>
        </div>
      </section>

      <section className="landing-section">
        <div className="howitworks-grid howitworks-grid-2">
          <article className="howitworks-card howitworks-card-stack">
            <div className="public-eyebrow">{copy.userView.eyebrow}</div>
            <h2 className="howitworks-card-title">{copy.userView.title}</h2>
            <p className="public-page-body">{copy.userView.body}</p>

            <ul className="howitworks-chip-list">
              {copy.userView.items.map((item) => (
                <li key={item} className="howitworks-chip">
                  {item}
                </li>
              ))}
            </ul>
          </article>

          <article className="howitworks-card howitworks-card-stack">
            <div className="public-eyebrow">{copy.credits.eyebrow}</div>
            <h2 className="howitworks-card-title">{copy.credits.title}</h2>
            <p className="public-page-body">{copy.credits.body}</p>

            <ul className="howitworks-point-list">
              {copy.credits.items.map((item) => (
                <li key={item} className="howitworks-point-item">
                  <span className="howitworks-point-dot" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.plans.eyebrow}</div>
          <h2 className="landing-section-title">{copy.plans.title}</h2>
          <p className="landing-section-body">{copy.plans.body}</p>
        </div>

        <div className="howitworks-plan-grid">
          {copy.plans.items.map((item) => (
            <article key={item.title} className="howitworks-plan-card">
              <h3 className="howitworks-plan-title">{item.title}</h3>
              <p className="howitworks-plan-body">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.routine.eyebrow}</div>
          <h2 className="landing-section-title">{copy.routine.title}</h2>
          <p className="landing-section-body">{copy.routine.body}</p>
        </div>

        <div className="landing-step-grid">
          {copy.routine.items.map((item) => (
            <article key={item.step} className="landing-step-card landing-step-card-compact">
              <div className="landing-step-number">{item.step}</div>
              <h3 className="landing-card-title">{item.title}</h3>
              <p className="landing-card-body">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="howitworks-grid howitworks-grid-2">
          <article className="howitworks-card howitworks-card-stack">
            <div className="public-eyebrow">{copy.disclaimer.eyebrow}</div>
            <h2 className="howitworks-card-title">{copy.disclaimer.title}</h2>
            <p className="public-page-body">{copy.disclaimer.body}</p>

            <ul className="howitworks-point-list">
              {copy.disclaimer.items.map((item) => (
                <li key={item} className="howitworks-point-item">
                  <span className="howitworks-point-dot" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </article>

          <article className="howitworks-card howitworks-card-stack howitworks-card-accent">
            <div className="public-eyebrow">{copy.essence.eyebrow}</div>
            <h2 className="howitworks-card-title">{copy.essence.title}</h2>
            <p className="public-page-body">{copy.essence.body}</p>
          </article>
        </div>
      </section>

      <section className="howitworks-faq-section">
        <div className="howitworks-faq-shell">
          <div className="landing-section-head compact">
            <div className="public-eyebrow">{copy.faq.eyebrow}</div>
            <h2 className="landing-section-title">{copy.faq.title}</h2>
            <p className="landing-section-body">{copy.faq.body}</p>
          </div>

          <div className="howitworks-faq-list">
            {copy.faq.items.map((item, index) => {
              const isOpen = openFaqIndex === index;

              return (
                <article
                  key={item.question}
                  className={`howitworks-faq-item ${isOpen ? "open" : ""}`}
                >
                  <button
                    type="button"
                    className="howitworks-faq-trigger"
                    onClick={() => setOpenFaqIndex(isOpen ? -1 : index)}
                    aria-expanded={isOpen}
                  >
                    <span>{item.question}</span>
                    <span className="howitworks-faq-icon" aria-hidden="true">
                      {isOpen ? "−" : "+"}
                    </span>
                  </button>

                  {isOpen ? (
                    <div className="howitworks-faq-answer">
                      <p>{item.answer}</p>
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="landing-final-cta">
        <div className="landing-final-cta-card">
          <div className="public-eyebrow">{copy.cta.eyebrow}</div>
          <h2 className="landing-final-cta-title">{copy.cta.title}</h2>
          <p className="landing-final-cta-body">{copy.cta.body}</p>

          <div className="public-actions">
            <Link to={`/${currentLang}`} className="public-btn public-btn-primary">
              {copy.cta.primaryCta}
            </Link>

            <Link to={`/${currentLang}/glossary`} className="public-btn public-btn-secondary">
              {copy.cta.secondaryCta}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}