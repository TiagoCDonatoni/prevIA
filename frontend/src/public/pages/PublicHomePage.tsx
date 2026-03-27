import React from "react";
import { Link, useParams } from "react-router-dom";

import { publicCopy } from "../content/publicCopy";
import { coercePublicLang } from "../lib/publicLang";

import { BetaLeadForm } from "../components/BetaLeadForm";

import previewMainImg from "../assets/previews/landing-main.png";
import previewMarketImg from "../assets/previews/landing-market.png";
import previewAnalyticsImg from "../assets/previews/landing-analytics.png";
import { PublicFreeAnonEmbed } from "../../product/components/PublicFreeAnonEmbed";
import { ENABLE_PUBLIC_FREE_ANON_EMBED } from "../../config";

import { usePublicSeo } from "../lib/publicSeo";

const PREVIEW_IMAGES = [
  previewMainImg,
  previewMarketImg,
  previewAnalyticsImg,
] as const;

export function PublicHomePage() {
  const { lang } = useParams<{ lang: string }>();
  const currentLang = coercePublicLang(lang);
  const copy = publicCopy(currentLang);

  const SEO = {
    pt: {
      title: "prevIA | Inteligência para apostas com base estatística",
      description:
        "Camada pública do prevIA com conteúdo educativo, glossário multilíngue e entrada para a futura experiência do produto.",
    },
    en: {
      title: "prevIA | Betting intelligence with statistical grounding",
      description:
        "prevIA public layer with educational content, multilingual glossary, and entry point to the future product experience.",
    },
    es: {
      title: "prevIA | Inteligencia para apuestas con base estadística",
      description:
        "Capa pública de prevIA con contenido educativo, glosario multilingüe y entrada a la futura experiencia del producto.",
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
      <section className="public-hero">
        <div className="public-hero-card public-hero-card-split">
          <div className="public-hero-main">
            <div className="public-eyebrow">{copy.home.hero.eyebrow}</div>
            <h1 className="public-title">{copy.home.hero.title}</h1>
            <p className="public-body">{copy.home.hero.body}</p>

            <div className="landing-chip-row landing-chip-row-hero">
              {copy.home.trustBar.map((item) => (
                <span key={item} className="landing-chip">
                  {item}
                </span>
              ))}
            </div>

            <div className="public-actions">
              <Link to={`/${currentLang}/glossary`} className="public-btn public-btn-primary">
                {copy.home.hero.primaryCta}
              </Link>

              <a href="#beta-form" className="public-btn public-btn-secondary">
                {copy.home.hero.secondaryCta}
              </a>
            </div>
          </div>

          <aside className="public-hero-sidecard" aria-label="Beta highlights">
            <div className="public-hero-sidecard-kicker">{copy.home.hero.sideKicker}</div>
            <div className="public-hero-sidecard-title">{copy.home.hero.sideTitle}</div>
            <p className="public-hero-sidecard-body">{copy.home.hero.sideBody}</p>

            <div className="public-hero-mini-list">
              {copy.home.hero.sidePoints.map((item) => (
                <div key={item} className="public-hero-mini-item">
                  <span className="public-hero-mini-dot" aria-hidden="true" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </section>

      {ENABLE_PUBLIC_FREE_ANON_EMBED ? (
        <div id="teste-gratis">
          <PublicFreeAnonEmbed
            lang={currentLang}
            eyebrow={copy.home.freeAnonEmbed.eyebrow}
            title={copy.home.freeAnonEmbed.title}
            body={copy.home.freeAnonEmbed.body}
          />
        </div>
      ) : null}

      <section className="landing-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.home.audience.eyebrow}</div>
          <h2 className="landing-section-title">{copy.home.audience.title}</h2>
          <p className="landing-section-body">{copy.home.audience.body}</p>
        </div>

        <div className="landing-card-grid compact">
          {copy.home.audience.items.map((item) => (
            <article key={item.title} className="landing-card landing-card-compact">
              <h3 className="landing-card-title">{item.title}</h3>
              <p className="landing-card-body">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.home.preview.eyebrow}</div>
          <h2 className="landing-section-title">{copy.home.preview.title}</h2>
          <p className="landing-section-body">{copy.home.preview.body}</p>
        </div>

        <div className="landing-preview-grid">
          {copy.home.preview.items.map((item, index) => {
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

      <section className="landing-section">
        <div className="landing-section-head compact">
          <div className="public-eyebrow">{copy.home.howItWorks.eyebrow}</div>
          <h2 className="landing-section-title">{copy.home.howItWorks.title}</h2>
          <p className="landing-section-body">{copy.home.howItWorks.body}</p>
        </div>

        <div className="landing-step-grid">
          {copy.home.howItWorks.steps.map((item) => (
            <article key={item.step} className="landing-step-card landing-step-card-compact">
              <div className="landing-step-number">{item.step}</div>
              <h3 className="landing-card-title">{item.title}</h3>
              <p className="landing-card-body">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <div id="beta-form">
        <BetaLeadForm lang={currentLang} />
      </div>

      <section className="landing-final-cta">
        <div className="landing-final-cta-card">
          <div className="public-eyebrow">{copy.home.finalCta.eyebrow}</div>
          <h2 className="landing-final-cta-title">{copy.home.finalCta.title}</h2>
          <p className="landing-final-cta-body">{copy.home.finalCta.body}</p>

          <div className="public-actions">
            <a href="#beta-form" className="public-btn public-btn-primary">
              {copy.home.finalCta.primaryCta}
            </a>

            <Link to={`/${currentLang}/glossary`} className="public-btn public-btn-secondary">
              {copy.home.finalCta.secondaryCta}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}