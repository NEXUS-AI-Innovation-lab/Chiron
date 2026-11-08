/**
 * Client Supabase du navigateur : il ne sert QU'À l'authentification.
 *
 * Les données métier ne passent jamais par Supabase depuis le navigateur :
 * elles passent par le backend FastAPI, qui vérifie le jeton de session.
 * La clé « publishable » (ex-clé anon) est publique par nature : elle permet
 * de créer un compte et de se connecter, et n'ouvre l'accès à aucune table
 * (voir supabase/migrations et docs/16-supabase.md).
 */

import { createClient, type SupportedStorage } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "http://127.0.0.1:56321";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

if (!SUPABASE_KEY) {
  // Erreur visible plutôt qu'une connexion qui échoue sans explication.
  console.error(
    "VITE_SUPABASE_PUBLISHABLE_KEY manquante : la connexion est impossible. " +
      "Voir docs/16-supabase.md.",
  );
}

/* --------------------------------------------------------------------------
   « Se souvenir de moi »
   Coché : la session est gardée dans localStorage et survit à la fermeture du
   navigateur. Décoché : elle va dans sessionStorage et disparaît avec l'onglet,
   ce qui convient à un poste partagé.
   -------------------------------------------------------------------------- */
const REMEMBER_KEY = "chiron_se_souvenir";

export function setRememberMe(remember: boolean): void {
  try {
    localStorage.setItem(REMEMBER_KEY, remember ? "1" : "0");
  } catch {
    /* stockage indisponible : on garde le comportement par défaut */
  }
}

export function getRememberMe(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) !== "0";
  } catch {
    return true;
  }
}

const sessionStorageAdapter: SupportedStorage = {
  getItem: (key) => {
    try {
      return sessionStorage.getItem(key) ?? localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key, value) => {
    try {
      if (getRememberMe()) {
        localStorage.setItem(key, value);
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, value);
        localStorage.removeItem(key);
      }
    } catch {
      /* navigation privée ou stockage plein : la session restera en mémoire */
    }
  },
  removeItem: (key) => {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      /* rien à faire */
    }
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: sessionStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    // Lit le jeton présent dans l'URL au retour du lien de réinitialisation
    // du mot de passe envoyé par e-mail.
    detectSessionInUrl: true,
  },
});
