/**
 * Thème clair / sombre de l'application.
 *
 * Le thème n'est PAS une donnée de page : il est lu par la barre de
 * navigation, par les graphiques du tableau de bord et, potentiellement, par
 * n'importe quel composant. Le faire descendre en props traverserait toute
 * l'arborescence pour rien. C'est le cas d'école d'un Context.
 *
 * Deux responsabilités, volontairement séparées :
 *   - la RÉACTIVITÉ  : useState -> les consommateurs se rerendent au changement ;
 *   - la PERSISTANCE : localStorage -> le choix survit à la fermeture de l'onglet.
 *
 * Le rendu visuel, lui, ne passe pas par React : on pose simplement
 * `data-theme` sur <html>, et les variables CSS de index.css font le reste.
 * Aucun composant n'a donc besoin de connaître le thème pour s'afficher
 * correctement — seuls ceux qui produisent des couleurs en JavaScript
 * (les graphiques Recharts) appellent useTheme().
 */

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";

import {
  readInitialTheme,
  ThemeContext,
  THEME_STORAGE_KEY,
  type Theme,
} from "./themeContext";

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Initialiseur PARESSEUX (une fonction, pas une valeur) : sans lui,
  // localStorage et matchMedia seraient interrogés à chaque rendu pour rien.
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  // Seul effet de bord du fichier : refléter l'état React dans le DOM.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Stockage indisponible : le thème reste valable pour la session.
    }
  }, [theme]);

  // useCallback : ces fonctions entrent dans la valeur du Context. Une
  // référence stable évite de rerendre tous les consommateurs à chaque rendu
  // du Provider.
  const setTheme = useCallback((next: Theme) => setThemeState(next), []);
  const toggleTheme = useCallback(
    () => setThemeState((current) => (current === "dark" ? "light" : "dark")),
    [],
  );

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
