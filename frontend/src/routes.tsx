import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import { ProductApp } from "./product/ProductApp";
import { AdminApp } from "./admin/AdminApp";

import { PublicLayout } from "./public/layout/PublicLayout";
import { PublicHomePage } from "./public/pages/PublicHomePage";
import { PublicHowItWorksPage } from "./public/pages/PublicHowItWorksPage";
import { GlossaryHubPage } from "./public/pages/GlossaryHubPage";
import { GlossaryTermPage } from "./public/pages/GlossaryTermPage";
import { PublicAboutPage } from "./public/pages/PublicAboutPage";

import { PublicContactPage } from "./public/pages/PublicContactPage";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Root curto: manda para PT por padrão */}
        <Route path="/" element={<Navigate to="/pt" replace />} />

        {/* Camada pública multilíngue */}
        <Route path="/:lang" element={<PublicLayout />}>
          <Route index element={<PublicHomePage />} />
          <Route path="how-it-works" element={<PublicHowItWorksPage />} />
          <Route path="glossary" element={<GlossaryHubPage />} />
          <Route path="glossary/:slug" element={<GlossaryTermPage />} />
          <Route path="about" element={<PublicAboutPage />} />
          <Route path="contact" element={<PublicContactPage />} />
        </Route>

        {/* Produto */}
        <Route path="/app/*" element={<ProductApp />} />

        {/* Admin */}
        <Route path="/admin/*" element={<AdminApp />} />

        {/* Fallback global */}
        <Route path="*" element={<Navigate to="/pt" replace />} />
      </Routes>
    </BrowserRouter>
  );
}