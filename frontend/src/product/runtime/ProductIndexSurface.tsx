import React, { useEffect } from "react";

import type { Lang } from "../i18n";
import ProductIndex from "../pages/ProductIndex";
import { useProductStore } from "../state/productStore";

export function ProductIndexSurface({ lang }: { lang: Lang }) {
  const store = useProductStore();
  const currentLang = store.state.lang;
  const setLang = store.setLang;

  useEffect(() => {
    if (currentLang !== lang) {
      setLang(lang);
    }
  }, [currentLang, lang, setLang]);

  return <ProductIndex />;
}