/**
 * Contexte du thème, isolé du composant Provider.
 *
 * Pourquoi deux fichiers ? La règle ESLint `react-refresh/only-export-components`
 * (active via `reactRefresh.configs.vite`) demande qu'un fichier exportant un
 * composant n'exporte rien d'autre : sinon le rafraîchissement à chaud ne sait
 * plus quoi remplacer et recharge toute la page. Le contexte et le hook vivent
 * donc ici, le composant dans ThemeProvider.tsx.
 */

import { createContext, useContext } from "react";

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "chiron_theme";

export interface ThemeValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

// `null` par défaut : permet de détecter un composant utilisé hors du Provider
// au lieu de lui servir silencieusement une valeur factice.
export const ThemeContext = createContext<ThemeValue | null>(null);

/** Choix initial : préférence enregistrée, sinon réglage du système. */
export function readInitialTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Navigation privée ou stockage bloqué : on retombe sur le système.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Accès au thème courant. Échoue bruyamment si le Provider manque. */
export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("useTheme doit être utilisé à l'intérieur de <ThemeProvider>");
  }
  return value;
}
