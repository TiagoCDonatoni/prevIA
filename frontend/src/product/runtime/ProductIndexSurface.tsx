import React, { useEffect } from "react";

import type { Lang } from "../i18n";
import ProductIndex from "../pages/ProductIndex";
import { useProductStore } from "../state/productStore";

type ProductIndexSurfaceMode = "app" | "public_embed";

export function ProductIndexSurface({
  lang,
  mode = "app",
}: {
  lang: Lang;
  mode?: ProductIndexSurfaceMode;
}) {
  const store = useProductStore();
  const currentLang = store.state.lang;
  const setLang = store.setLang;

  useEffect(() => {
    if (currentLang !== lang) {
      setLang(lang);
    }
  }, [currentLang, lang, setLang]);

  return <ProductIndex mode={mode} />;
}