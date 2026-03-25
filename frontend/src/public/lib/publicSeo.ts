import { useEffect } from "react";
import type { Lang } from "../../i18n";

type PublicSeoInput = {
  lang: Lang;
  path: string;
  title: string;
  description: string;
};

const PUBLIC_SITE_ORIGIN =
  import.meta.env.VITE_PUBLIC_SITE_ORIGIN?.replace(/\/+$/, "") || "http://localhost:5173";

function upsertMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLMetaElement | null;

  if (!el) {
    el = document.createElement("meta");
    document.head.appendChild(el);
  }

  Object.entries(attrs).forEach(([key, value]) => {
    el!.setAttribute(key, value);
  });
}

function upsertLink(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as HTMLLinkElement | null;

  if (!el) {
    el = document.createElement("link");
    document.head.appendChild(el);
  }

  Object.entries(attrs).forEach(([key, value]) => {
    el!.setAttribute(key, value);
  });
}

export function usePublicSeo({ lang, path, title, description }: PublicSeoInput) {
  useEffect(() => {
    document.title = title;

    const canonicalHref = `${PUBLIC_SITE_ORIGIN}${path}`;

    upsertMeta('meta[name="description"]', {
      name: "description",
      content: description,
    });

    upsertMeta('meta[property="og:title"]', {
      property: "og:title",
      content: title,
    });

    upsertMeta('meta[property="og:description"]', {
      property: "og:description",
      content: description,
    });

    upsertMeta('meta[property="og:type"]', {
      property: "og:type",
      content: "website",
    });

    upsertMeta('meta[property="og:url"]', {
      property: "og:url",
      content: canonicalHref,
    });

    upsertMeta('meta[name="twitter:card"]', {
      name: "twitter:card",
      content: "summary_large_image",
    });

    upsertLink('link[rel="canonical"]', {
      rel: "canonical",
      href: canonicalHref,
    });

    const localizedPaths = {
      pt: path.replace(/^\/(pt|en|es)/, "/pt"),
      en: path.replace(/^\/(pt|en|es)/, "/en"),
      es: path.replace(/^\/(pt|en|es)/, "/es"),
    };

    (["pt", "en", "es"] as Lang[]).forEach((item) => {
      upsertLink(`link[rel="alternate"][hreflang="${item}"]`, {
        rel: "alternate",
        hrefLang: item,
        href: `${PUBLIC_SITE_ORIGIN}${localizedPaths[item]}`,
      });
    });

    upsertLink('link[rel="alternate"][hreflang="x-default"]', {
      rel: "alternate",
      hrefLang: "x-default",
      href: `${PUBLIC_SITE_ORIGIN}${localizedPaths.pt}`,
    });

    document.documentElement.setAttribute("lang", lang);
  }, [lang, path, title, description]);
}