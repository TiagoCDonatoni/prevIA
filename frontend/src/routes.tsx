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
import { PublicAnalyticsTracker } from "./public/PublicAnalyticsTracker";
import { PublicBetaCampaignPage } from "./public/pages/PublicBetaCampaignPage";
import { WorldCupPoolLandingPage } from "./public/pages/WorldCupPoolLandingPage";
import { WorldCupPoolJoinPlaceholderPage } from "./public/pages/WorldCupPoolJoinPlaceholderPage";
import { WorldCupPoolOrganizerPage } from "./public/pages/WorldCupPoolOrganizerPage";
import { WorldCupPoolParticipantPage } from "./public/pages/WorldCupPoolParticipantPage";
import { WorldCupPoolMyPoolsPage } from "./public/pages/WorldCupPoolMyPoolsPage";
import { PublicPartnersPage } from "./public/pages/PublicPartnersPage";
import { PartnerConsolePage } from "./partner/PartnerConsolePage";

import { ENABLE_ADMIN_APP, ENABLE_PRODUCT_APP, ENABLE_WORLDCUP_POOL } from "./config";

export function AppRoutes() {
  return (
    <BrowserRouter>
      <PublicAnalyticsTracker />

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
          <Route path="parceiros" element={<PublicPartnersPage />} />
          <Route path="partners" element={<PublicPartnersPage />} />
          <Route path="socios" element={<PublicPartnersPage />} />
          <Route path="parceiros/painel" element={<PartnerConsolePage />} />
          <Route path="partners/dashboard" element={<PartnerConsolePage />} />
          <Route path="socios/panel" element={<PartnerConsolePage />} />
          <Route path="beta/:slug" element={<PublicBetaCampaignPage />} />
          <Route path="campanha/:slug" element={<PublicBetaCampaignPage />} />
          <Route
            path="bolao/copa"
            element={ENABLE_WORLDCUP_POOL ? <WorldCupPoolLandingPage /> : <Navigate to="/pt" replace />}
          />
          <Route
            path="bolao/copa/entrar/:inviteToken"
            element={
              ENABLE_WORLDCUP_POOL ? <WorldCupPoolJoinPlaceholderPage /> : <Navigate to="/pt" replace />
            }
          />
          <Route
            path="bolao/copa/meus-boloes"
            element={
              ENABLE_WORLDCUP_POOL ? <WorldCupPoolMyPoolsPage /> : <Navigate to="/pt" replace />
            }
          />
          <Route
            path="bolao/copa/painel/:inviteToken"
            element={
              ENABLE_WORLDCUP_POOL ? <WorldCupPoolParticipantPage /> : <Navigate to="/pt" replace />
            }
          />
          <Route
            path="bolao/copa/admin/:slug"
            element={
              ENABLE_WORLDCUP_POOL ? <WorldCupPoolOrganizerPage /> : <Navigate to="/pt" replace />
            }
          />
        </Route>

        {/* Produto guardado por flag */}
        <Route
          path="/app/*"
          element={
            ENABLE_PRODUCT_APP ? <ProductApp /> : <Navigate to="/pt" replace />
          }
        />

        {/* Admin guardado por flag */}
        <Route
          path="/admin/*"
          element={
            ENABLE_ADMIN_APP ? <AdminApp /> : <Navigate to="/pt" replace />
          }
        />

        {/* Fallback global */}
        <Route path="*" element={<Navigate to="/pt" replace />} />
      </Routes>
    </BrowserRouter>
  );
}