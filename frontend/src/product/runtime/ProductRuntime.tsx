import React from "react";

import { ProductStoreProvider } from "../state/productStore";
import ProductBootstrap from "../state/ProductBootstrap";
import "../product.css";

export function ProductRuntime({ children }: { children: React.ReactNode }) {
  return (
    <ProductStoreProvider>
      <ProductBootstrap>{children}</ProductBootstrap>
    </ProductStoreProvider>
  );
}