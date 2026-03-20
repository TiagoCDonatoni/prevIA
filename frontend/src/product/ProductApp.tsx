import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProductLayout } from "./layout/ProductLayout";
import "./product.css";
import { ProductStoreProvider } from "./state/productStore";
import ProductBootstrap from "./state/ProductBootstrap";
import ProductIndex from "./pages/ProductIndex";

export function ProductApp() {
  return (
    <ProductStoreProvider>
      <ProductBootstrap>
        <Routes>
          <Route path="/" element={<ProductLayout />}>
            <Route index element={<ProductIndex />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </ProductBootstrap>
    </ProductStoreProvider>
  );
}