import React from "react";

import type { Lang } from "../i18n";
import brFlag from "../product/assets/br.svg";
import gbFlag from "../product/assets/gb.svg";
import esFlag from "../product/assets/es.svg";

import "./language-dropdown.css";

type Props = {
  value: Lang;
  onChange: (next: Lang) => void;
  ariaLabel?: string;
  menuAlign?: "left" | "right";
};

const LANG_OPTIONS: Array<{
  lang: Lang;
  code: string;
  name: string;
  flagSrc: string;
}> = [
  { lang: "pt", code: "PT", name: "Português", flagSrc: brFlag },
  { lang: "en", code: "EN", name: "English", flagSrc: gbFlag },
  { lang: "es", code: "ES", name: "Español", flagSrc: esFlag },
];

function getLangOption(lang: Lang) {
  return LANG_OPTIONS.find((item) => item.lang === lang) ?? LANG_OPTIONS[0];
}

export function LanguageDropdown({
  value,
  onChange,
  ariaLabel,
  menuAlign = "left",
}: Props) {
  const [open, setOpen] = React.useState(false);
  const cur = getLangOption(value);

  return (
    <div className="lang-dd" onBlur={() => setOpen(false)} tabIndex={-1}>
      <button
        type="button"
        className="lang-dd-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel ?? cur.name}
        onClick={() => setOpen((prev) => !prev)}
      >
        <img src={cur.flagSrc} alt="" className="lang-flag-img" aria-hidden="true" />
        <span className="lang-code">{cur.code}</span>
        <span className="lang-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div
          className={`lang-dd-menu ${menuAlign === "right" ? "is-right" : ""}`}
          role="menu"
        >
          {LANG_OPTIONS.map((item) => {
            const active = item.lang === value;

            return (
              <button
                key={item.lang}
                type="button"
                className={`lang-dd-item ${active ? "is-active" : ""}`}
                role="menuitem"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(item.lang);
                  setOpen(false);
                }}
              >
                <img src={item.flagSrc} alt="" className="lang-flag-img" aria-hidden="true" />
                <span className="lang-code">{item.code}</span>
                <span className="lang-name">{item.name}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}