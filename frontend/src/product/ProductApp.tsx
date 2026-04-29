import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProductLayout } from "./layout/ProductLayout";
import { ProductRuntime } from "./runtime/ProductRuntime";
import ProductIndex from "./pages/ProductIndex";
import ProductAccountPage from "./pages/ProductAccountPage";
import ProductManualAnalysisPage from "./pages/ProductManualAnalysisPage";

export function ProductApp() {
  return (
    <ProductRuntime>
      <Routes>
        <Route path="/" element={<ProductLayout />}>
          <Route index element={<ProductIndex />} />
          <Route path="account" element={<ProductAccountPage />} />
          <Route path="manual-analysis" element={<ProductManualAnalysisPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProductRuntime>
  );
}