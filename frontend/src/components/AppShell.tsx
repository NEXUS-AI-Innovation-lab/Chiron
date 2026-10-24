/**
 * Cadre commun des écrans de navigation : barre supérieure + zone de contenu.
 *
 * Volontairement ABSENT des deux visionneuses (lame et radiologie) : pendant
 * la manipulation d'une image médicale, l'écran doit être entièrement dédié à
 * l'image. Ces pages portent leur propre retour explicite vers le tableau de
 * bord.
 *
 * La barre reste sombre (#1e2a3a) dans les deux thèmes : c'est le repère fixe
 * de l'application, celui qui permet de savoir en permanence où l'on est et
 * comment revenir en arrière.
 */

import { useNavigate } from "react-router-dom";
import type { ReactNode } from "react";

import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import LogoutIcon from "@mui/icons-material/Logout";

import { useTheme } from "../features/theme/themeContext";
import Logo from "./Logo";

interface AppShellProps {
  /** Titre de la page, affiché à droite de la marque. */
  title: string;
  /** Nom de l'utilisateur connecté, affiché dans la pastille. */
  user: string;
  /** Actions propres à la page (boutons), alignées à droite du titre. */
  actions?: ReactNode;
  children: ReactNode;
}

/** Initiales de l'utilisateur, deux lettres au maximum. */
function initialsOf(name: string): string {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function AppShell({ title, user, actions, children }: AppShellProps) {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();

  const handleLogout = () => {
    localStorage.removeItem("biopsie_user");
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-canvas">
      {/* ---------- Barre supérieure ---------- */}
      <header className="bg-nav text-nav-ink">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 md:px-8">
          {/* Marque : ramène au tableau de bord, comme partout sur le web */}
          <button
            type="button"
            onClick={() => navigate("/dashboard")}
            className="flex items-center gap-2 rounded-lg px-1 py-1"
            title="Revenir au tableau de bord"
          >
            {/* La barre reste sombre dans les deux themes : le logo y est
                donc toujours dans sa version claire. */}
            <Logo fond="sombre" hauteur={36} />
            <span className="text-[15px] font-semibold tracking-tight">Chiron.</span>
          </button>

          {/* Pas de titre de page ici : il est déjà affiché juste en dessous,
              en grand. Le répéter à 40 px d'écart n'apporte rien et alourdit
              la barre. */}

          <div className="ml-auto flex items-center gap-1.5">
            <button
              type="button"
              onClick={toggleTheme}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-nav-muted hover:bg-white/10 hover:text-nav-ink"
              title={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
              aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
            >
              {theme === "dark" ? (
                <LightModeIcon fontSize="small" />
              ) : (
                <DarkModeIcon fontSize="small" />
              )}
            </button>

            {/* Identité : l'utilisateur doit voir sous quel nom il signe ses
                annotations, c'est une exigence de traçabilité médicale. */}
            <div className="ml-1 flex items-center gap-2.5 pl-2">
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold"
              >
                {initialsOf(user)}
              </span>
              <span className="hidden text-sm sm:block">{user}</span>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-nav-muted hover:bg-white/10 hover:text-nav-ink"
              title="Se déconnecter"
              aria-label="Se déconnecter"
            >
              <LogoutIcon fontSize="small" />
            </button>
          </div>
        </div>
      </header>

      {/* ---------- Titre de page et actions ---------- */}
      <div className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-5 md:px-8">
          <h1 className="wg-h1">{title}</h1>
          {actions && <div className="ml-auto flex flex-wrap gap-2">{actions}</div>}
        </div>
      </div>

      {/* ---------- Contenu ---------- */}
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-8">{children}</main>
    </div>
  );
}
