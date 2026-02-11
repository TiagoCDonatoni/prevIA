import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Produto
import { ProductApp } from "./product/ProductApp";

// Admin (mantém o que você já tem)
import { AdminApp } from "./admin/AdminApp";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Produto (Index comercial) */}
        <Route path="/index/*" element={<ProductApp />} />

        {/* Raiz -> Index */}
        <Route path="/" element={<Navigate to="/index" replace />} />

        {/* Admin */}
        <Route path="/admin/*" element={<AdminApp />} />

        {/* fallback */}
        <Route path="*" element={<Navigate to="/index" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
