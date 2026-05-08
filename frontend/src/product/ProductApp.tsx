import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { ProductLayout } from "./layout/ProductLayout";
import { ProductRuntime } from "./runtime/ProductRuntime";
import ProductIndex from "./pages/ProductIndex";
import ProductAccountPage from "./pages/ProductAccountPage";
import ProductManualAnalysisPage from "./pages/ProductManualAnalysisPage";
import { ENABLE_PRODUCT_MANUAL_ANALYSIS_PAGE } from "../config";

export function ProductApp() {
  return (
    <ProductRuntime>
      <Routes>
        <Route path="/" element={<ProductLayout />}>
          <Route index element={<ProductIndex />} />
          <Route path="account" element={<ProductAccountPage />} />
                    <Route
            path="manual-analysis"
            element={
              ENABLE_PRODUCT_MANUAL_ANALYSIS_PAGE ? (
                <ProductManualAnalysisPage />
              ) : (
                <Navigate to="/app" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </ProductRuntime>
  );
}