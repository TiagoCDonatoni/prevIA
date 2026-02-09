import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProductLayout } from "./layout/ProductLayout";
import ProductOdds from "../views/ProductOdds";
import "./product.css";
import { ProductStoreProvider } from "./state/productStore";
import { useProductStore } from "./state/productStore";

function ProductOddsWithResetKey() {
  const store = useProductStore();
  return <ProductOdds key={store.resetNonce} />;
}

export function ProductApp() {
  return (
    <ProductStoreProvider>
      <Routes>
        <Route element={<ProductLayout />}>
          <Route index element={<ProductOddsWithResetKey />} />
        </Route>

        <Route path="*" element={<Navigate to="/index" replace />} />
      </Routes>
    </ProductStoreProvider>
  );
}
