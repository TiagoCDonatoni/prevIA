/**
 * Config central do frontend.
 * Tudo que for flag/env deve sair daqui, não espalhado.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export const PUBLIC_SITE_ORIGIN =
  String(import.meta.env.VITE_PUBLIC_SITE_ORIGIN ?? "http://localhost:5173").replace(/\/+$/, "");

export const IS_DEV = import.meta.env.DEV;

function envFlag(value: unknown, fallback = false) {
  if (value == null) return fallback;
  return String(value).toLowerCase() === "true";
}

export const PRODUCT_AUTH_ENABLED =
  envFlag(import.meta.env.VITE_PRODUCT_AUTH_ENABLED, false);

export const PRODUCT_DEV_AUTO_LOGIN_ENABLED =
  IS_DEV && envFlag(import.meta.env.VITE_PRODUCT_DEV_AUTO_LOGIN_ENABLED, false);

export const PRODUCT_DEV_AUTO_LOGIN_EMAIL =
  String(import.meta.env.VITE_PRODUCT_DEV_AUTO_LOGIN_EMAIL ?? "dev@previa.local").trim();

export const PRODUCT_DEV_AUTO_LOGIN_PLAN =
  String(import.meta.env.VITE_PRODUCT_DEV_AUTO_LOGIN_PLAN ?? "PRO").trim().toUpperCase();

export const ENABLE_PRODUCT_APP =
  envFlag(import.meta.env.VITE_ENABLE_PRODUCT_APP, false);

export const ENABLE_ADMIN_APP =
  envFlag(import.meta.env.VITE_ENABLE_ADMIN_APP, false);

export const ENABLE_PUBLIC_FREE_ANON_EMBED =
  envFlag(import.meta.env.VITE_ENABLE_PUBLIC_FREE_ANON_EMBED, false);

export const ENABLE_PUBLIC_PRODUCT_LAYER =
  envFlag(import.meta.env.VITE_ENABLE_PUBLIC_PRODUCT_LAYER, false);