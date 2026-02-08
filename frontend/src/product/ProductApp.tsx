import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import "./product.css";

import { ProductLayout } from "./layout/ProductLayout";
import ProductOdds from "../views/ProductOdds"; // reaproveita sua tela atual do produto

export function ProductApp() {
  return (
    <Routes>
      <Route element={<ProductLayout />}>
        <Route index element={<ProductOdds />} />
        {/* Futuras rotas do produto */}
        {/* <Route path="history" element={<History />} /> */}
        {/* <Route path="about" element={<About />} /> */}
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
