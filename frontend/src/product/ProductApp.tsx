import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProductLayout } from "./layout/ProductLayout";
import "./product.css";
import { ProductStoreProvider } from "./state/productStore";

import ProductIndex from "./pages/ProductIndex";

export function ProductApp() {
  return (
    <ProductStoreProvider>
      <Routes>
        <Route element={<ProductLayout />}>
          {/* INDEX NOVO "do zero" */}
          <Route index element={<ProductIndex />} />
        </Route>

        <Route path="*" element={<Navigate to="/index" replace />} />
      </Routes>
    </ProductStoreProvider>
  );
}
