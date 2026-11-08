/**
 * Gabarit des écrans d'authentification, d'après la maquette Figma
 * « 01 · Connexion » : panneau de présentation sombre à gauche (620 px),
 * formulaire centré à droite (420 px).
 *
 * Sous 1024 px, le panneau de gauche disparaît et la marque passe au-dessus
 * du formulaire : sur un écran étroit, le formulaire reste la priorité.
 */

import type { ReactNode } from "react";

import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";

import { useTheme } from "../../theme/themeContext";
import { AuthIcon } from "./AuthIcon";

const ARGUMENTS = [
  "Vos lames et examens au même endroit",
  "L'avancement de chaque dossier en un coup d'œil",
  "Un second avis demandé en deux clics",
];

function Wordmark({ className = "" }: { className?: string }) {
  return (
    <p className={`text-[30px] font-extrabold tracking-[-0.6px] ${className}`}>
      Chiron<span className="text-accent">.</span>
    </p>
  );
}

export function AuthLayout({ children }: { children: ReactNode }) {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="flex min-h-screen bg-surface">
      {/* --- Présentation (toujours sombre, comme la barre de navigation) --- */}
      <aside className="hidden w-[620px] shrink-0 flex-col bg-nav p-14 text-nav-ink lg:flex">
        <Wordmark className="text-nav-ink" />
        <div className="flex-1" />
        <h2 className="max-w-[500px] text-[38px] font-extrabold leading-[47px] tracking-[-0.76px]">
          La lecture partagée des lames et des examens, pour les pathologistes et les radiologues.
        </h2>
        <ul className="mt-8 flex flex-col gap-4">
          {ARGUMENTS.map((argument) => (
            <li key={argument} className="flex items-center gap-[14px]">
              <span className="flex size-[30px] shrink-0 items-center justify-center rounded-full bg-accent text-on-accent">
                <AuthIcon name="check-pastille" size={16} />
              </span>
              <span className="text-base font-semibold">{argument}</span>
            </li>
          ))}
        </ul>
        <div className="flex-1" />
        <div className="flex items-center gap-3 rounded-2xl bg-nav-raised px-[18px] py-4 text-nav-soft">
          <AuthIcon name="info" size={20} />
          <p className="text-sm leading-5">
            Plateforme de démonstration : n'y saisissez aucune donnée patient réelle.
          </p>
        </div>
      </aside>

      {/* --- Formulaire --- */}
      <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-16">
        <button
          type="button"
          onClick={toggleTheme}
          className="wg-btn wg-btn-quiet wg-btn-icon absolute right-4 top-4"
          title={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
          aria-label={theme === "dark" ? "Passer en thème clair" : "Passer en thème sombre"}
        >
          {theme === "dark" ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
        </button>

        <div className="w-full max-w-[420px]">
          <Wordmark className="mb-10 text-ink lg:hidden" />
          {children}
        </div>
      </main>
    </div>
  );
}

/** Titre et sous-titre d'un écran d'authentification. */
export function AuthHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-6 flex flex-col gap-2">
      <h1 className="text-[36px] font-extrabold leading-tight tracking-[-0.72px] text-ink">{title}</h1>
      <p className="text-[15px] text-muted">{subtitle}</p>
    </div>
  );
}

/** Message d'erreur ou de confirmation, sous le titre. */
export function AuthNotice({ tone, children }: { tone: "danger" | "success"; children: ReactNode }) {
  const colors =
    tone === "danger" ? "bg-danger-soft text-danger-text" : "bg-accent-soft text-accent-text";
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={`flex items-start gap-2.5 rounded-xl px-4 py-3 text-sm ${colors}`}>
      <AuthIcon name={tone === "danger" ? "warning" : "check-case"} size={18} className="mt-px" />
      <div>{children}</div>
    </div>
  );
}

/** Pied de formulaire, en petit texte discret. */
export function AuthFootnote({ children }: { children: ReactNode }) {
  return <p className="mx-auto text-center text-xs text-faint">{children}</p>;
}
