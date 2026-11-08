/**
 * Accès HTTP au backend Chiron, avec le jeton de session Supabase.
 *
 * Toutes les routes métier du backend exigent `Authorization: Bearer <jeton>`.
 * Deux portes d'entrée, pour les deux façons d'appeler l'API dans le projet :
 *
 *   - axios : un intercepteur ajoute l'en-tête à toute requête vers API_URL
 *     (installé une fois, à l'import de ce module dans main.tsx) ;
 *   - fetch : utiliser `apiFetch` à la place de `fetch` pour le backend.
 *
 * Les autres services (OLGA, proxy Orthanc) ne reçoivent JAMAIS le jeton :
 * seule l'adresse du backend est concernée.
 *
 * Si le backend répond 401 (session expirée ou révoquée), l'événement
 * UNAUTHORIZED_EVENT est émis ; AuthProvider déconnecte alors l'utilisateur,
 * et les gardes de route le renvoient vers /login.
 */

import axios from "axios";

import { supabase } from "../features/auth/supabaseClient";

export const API_URL: string = import.meta.env.VITE_API_URL || "http://localhost:8002";

export const UNAUTHORIZED_EVENT = "chiron:non-authentifie";

/** Jeton d'accès courant, rafraîchi par Supabase s'il a expiré. */
export async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function isBackendUrl(url: string | undefined): boolean {
  return Boolean(url && url.startsWith(API_URL));
}

function signalUnauthorized(): void {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
}

/** `fetch` vers le backend, avec le jeton de session. */
export async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (isBackendUrl(url)) {
    const token = await getAccessToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && isBackendUrl(url)) signalUnauthorized();
  return response;
}

// --- axios : même règle, appliquée à l'instance par défaut -----------------
axios.interceptors.request.use(async (config) => {
  if (isBackendUrl(config.url)) {
    const token = await getAccessToken();
    if (token) config.headers.set("Authorization", `Bearer ${token}`);
  }
  return config;
});

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (axios.isAxiosError(error) && error.response?.status === 401 && isBackendUrl(error.config?.url)) {
      signalUnauthorized();
    }
    return Promise.reject(error);
  },
);
