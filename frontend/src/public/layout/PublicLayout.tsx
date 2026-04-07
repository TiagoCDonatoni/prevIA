import React from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate, useParams } from "react-router-dom";

import type { Lang } from "../../i18n";
import { publicCopy } from "../content/publicCopy";
import { coercePublicLang, isPublicLang, replaceUrlLang } from "../lib/publicLang";
import "../public.css";
import BrandLogo from "../../shared/BrandLogo";
import { LanguageDropdown } from "../../shared/LanguageDropdown";
import { ProductAuthModal } from "../../product/auth/ProductAuthModal";
import { ENABLE_PUBLIC_PRODUCT_LAYER } from "../../config";

const PUBLIC_FOOTER_COPY = {
  pt: {
    body:
      "Inteligência aplicada a apostas esportivas, com foco em dados, probabilidade, leitura de mercado e experiência clara de uso.",
    navigationTitle: "Navegação",
    socialTitle: "Redes sociais",
    links: {
      home: "Home",
      howItWorks: "Como funciona",
      glossary: "Glossário",
      about: "Sobre",
      contact: "Contato",
    },
    social: ["X · @prevIA", "Instagram · @prevIA", "TikTok · @prevIA"],
    madeIn: "Feito no Brasil @prevIA {year}",
  },
  en: {
    body:
      "Applied intelligence for sports betting, focused on data, probability, market reading, and a clear product experience.",
    navigationTitle: "Navigation",
    socialTitle: "Social",
    links: {
      home: "Home",
      howItWorks: "How it works",
      glossary: "Glossary",
      about: "About",
      contact: "Contact",
    },
    social: ["X · @prevIA", "Instagram · @prevIA", "TikTok · @prevIA"],
    madeIn: "Built in Brazil @prevIA {year}",
  },
  es: {
    body:
      "Inteligencia aplicada a apuestas deportivas, con foco en datos, probabilidad, lectura de mercado y una experiencia clara de uso.",
    navigationTitle: "Navegación",
    socialTitle: "Redes sociales",
    links: {
      home: "Home",
      howItWorks: "Cómo funciona",
      glossary: "Glosario",
      about: "Sobre",
      contact: "Contacto",
    },
    social: ["X · @prevIA", "Instagram · @prevIA", "TikTok · @prevIA"],
    madeIn: "Hecho en Brasil @prevIA {year}",
  },
} as const;

export function PublicLayout() {
  const { lang } = useParams<{ lang: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  React.useLayoutEffect(() => {
    if (location.hash) return;

    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto",
    });
  }, [location.pathname]);

  if (!isPublicLang(lang)) {
    return <Navigate to="/pt" replace />;
  }

  const currentLang = coercePublicLang(lang);
  const copy = publicCopy(currentLang);

  const footer = PUBLIC_FOOTER_COPY[currentLang];

  const [isMobileMenuOpen, setIsMobileMenuOpen] = React.useState(false);

  const [authOpen, setAuthOpen] = React.useState(false);
  const [authInitialMode, setAuthInitialMode] = React.useState<
    "signup" | "login" | "forgot" | "reset"
  >("signup");

  const navItems = [
    {
      key: "how-it-works",
      to: `/${currentLang}/how-it-works`,
      label: copy.nav.howItWorks,
    },
    {
      key: "glossary",
      to: `/${currentLang}/glossary`,
      label: copy.nav.glossary,
    },
    {
      key: "about",
      to: `/${currentLang}/about`,
      label: copy.nav.about,
    },
  ] as const;

  React.useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname, location.search, location.hash]);

  React.useEffect(() => {
    if (!isMobileMenuOpen) return;

    const previousOverflow = document.body.style.overflow;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsMobileMenuOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isMobileMenuOpen]);

  function openAuthModal(mode: "signup" | "login") {
    setAuthInitialMode(mode);
    setIsMobileMenuOpen(false);
    setAuthOpen(true);
  }

  return (
    <div className="public-shell">
      <header className="public-header">
        <div className="public-header-inner">
          <NavLink to={`/${currentLang}`} className="public-brand" aria-label="prevIA home">
            <BrandLogo />
          </NavLink>
            <nav className="public-nav" aria-label="Public navigation">
              {ENABLE_PUBLIC_PRODUCT_LAYER ? (
                <Link
                  to={`/${currentLang}#teste-gratis`}
                  className="public-mobile-nav-link active"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {copy.nav.testFree}
                </Link>
              ) : null}

              {navItems.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  className={({ isActive }) => `public-nav-link ${isActive ? "active" : ""}`}
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>

            <div className="public-header-right">
              <LanguageDropdown
                value={currentLang}
                ariaLabel={copy.nav.language}
                menuAlign="right"
                onChange={(nextLang) => {
                  navigate({
                    pathname: replaceUrlLang(location.pathname, nextLang),
                    search: location.search,
                    hash: location.hash,
                  });
                }}
              />

              <button
                type="button"
                className={`public-menu-btn ${isMobileMenuOpen ? "open" : ""}`}
                aria-label="Toggle navigation menu"
                aria-expanded={isMobileMenuOpen}
                aria-controls="public-mobile-nav"
                onClick={() => setIsMobileMenuOpen((current) => !current)}
              >
                <span className="public-menu-btn-bar" />
                <span className="public-menu-btn-bar" />
                <span className="public-menu-btn-bar" />
              </button>

            {ENABLE_PUBLIC_PRODUCT_LAYER ? (
              <div className="public-header-auth">
                <button
                  type="button"
                  className="public-btn public-btn-secondary public-header-auth-btn"
                  onClick={() => openAuthModal("login")}
                >
                  {copy.nav.login}
                </button>

                <button
                  type="button"
                  className="public-btn public-btn-primary public-header-auth-btn"
                  onClick={() => openAuthModal("signup")}
                >
                  {copy.nav.createAccount}
                </button>
              </div>
            ) : null}
          </div>
        </div>

      </header>

      {isMobileMenuOpen ? (
        <>
          <button
            type="button"
            className="public-mobile-nav-backdrop"
            aria-label="Close navigation menu"
            onClick={() => setIsMobileMenuOpen(false)}
          />

          <div id="public-mobile-nav" className="public-mobile-nav-panel">
            <nav className="public-mobile-nav-list" aria-label="Public navigation mobile">
              <Link
                to={`/${currentLang}#teste-gratis`}
                className="public-mobile-nav-link active"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {copy.nav.testFree}
              </Link>

              {navItems.map((item) => (
                <NavLink
                  key={item.key}
                  to={item.to}
                  className={({ isActive }) =>
                    `public-mobile-nav-link ${isActive ? "active" : ""}`
                  }
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  {item.label}
                </NavLink>
              ))}

              <Link
                to={`/${currentLang}/contact`}
                className="public-mobile-nav-link"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {footer.links.contact}
              </Link>

              {ENABLE_PUBLIC_PRODUCT_LAYER ? (
                <div className="public-mobile-nav-auth">
                  <button
                    type="button"
                    className="public-mobile-nav-link public-mobile-nav-link-secondary"
                    onClick={() => openAuthModal("login")}
                  >
                    {copy.nav.login}
                  </button>

                  <button
                    type="button"
                    className="public-mobile-nav-link public-mobile-nav-link-primary"
                    onClick={() => openAuthModal("signup")}
                  >
                    {copy.nav.createAccount}
                  </button>
                </div>
              ) : null}
            </nav>
          </div>
        </>
      ) : null}

      <main className="public-main">
        <Outlet />
      </main>

      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-grid">
            <div className="public-footer-brandblock">
              <Link to={`/${currentLang}`} className="public-footer-brandlink" aria-label="prevIA home">
                <BrandLogo compact />
              </Link>

              <p className="public-footer-body">{footer.body}</p>
            </div>

            <div className="public-footer-col">
              <div className="public-footer-title">{footer.navigationTitle}</div>

              <div className="public-footer-links">
                <Link to={`/${currentLang}`} className="public-footer-link">
                  {footer.links.home}
                </Link>

                <Link to={`/${currentLang}/how-it-works`} className="public-footer-link">
                  {footer.links.howItWorks}
                </Link>

                <Link to={`/${currentLang}/glossary`} className="public-footer-link">
                  {footer.links.glossary}
                </Link>

                <Link to={`/${currentLang}/about`} className="public-footer-link">
                  {footer.links.about}
                </Link>

                <Link to={`/${currentLang}/contact`} className="public-footer-link">
                  {footer.links.contact}
                </Link>
              </div>
            </div>

            <div className="public-footer-col">
              <div className="public-footer-title">{footer.socialTitle}</div>

              <div className="public-footer-socials">
                {footer.social.map((item) => (
                  <span key={item} className="public-footer-social-pill">
                    {item}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="public-footer-bottom">
            <span className="public-footer-muted">
              {footer.madeIn.replace("{year}", String(new Date().getFullYear()))}
            </span>
          </div>
        </div>
      </footer>
      {ENABLE_PUBLIC_PRODUCT_LAYER ? (
        <ProductAuthModal
          open={authOpen}
          lang={currentLang as Lang}
          initialMode={authInitialMode}
          onClose={() => setAuthOpen(false)}
          onAuthSuccess={async () => {
            setAuthOpen(false);
            navigate("/app");
          }}
        />
      ) : null}
    </div>
  );
}