/**
 * Config central do frontend.
 * Tudo que for flag/env deve sair daqui, não espalhado.
 */
export const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export const IS_DEV = import.meta.env.DEV;

export const PRODUCT_AUTH_ENABLED =
  String(import.meta.env.VITE_PRODUCT_AUTH_ENABLED ?? "false").toLowerCase() === "true";

export const PRODUCT_DEV_AUTO_LOGIN_ENABLED =
  IS_DEV &&
  String(import.meta.env.VITE_PRODUCT_DEV_AUTO_LOGIN_ENABLED ?? "false").toLowerCase() === "true";

export const PRODUCT_DEV_AUTO_LOGIN_EMAIL =
  String(import.meta.env.VITE_PRODUCT_DEV_AUTO_LOGIN_EMAIL ?? "dev@previa.local").trim();

export const PRODUCT_DEV_AUTO_LOGIN_PLAN =
  String(import.meta.env.VITE_PRODUCT_DEV_AUTO_LOGIN_PLAN ?? "PRO").trim().toUpperCase();