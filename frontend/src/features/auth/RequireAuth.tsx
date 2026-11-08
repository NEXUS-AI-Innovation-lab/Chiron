/**
 * Garde de route : n'affiche son contenu qu'à un utilisateur connecté.
 *
 * Remplace l'ancienne constante `isAuthenticated = true` d'App.tsx, qui ne
 * protégeait rien. Sans session, redirige vers /login en mémorisant la page
 * demandée, pour y revenir après la connexion.
 */

import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "./authContext";

export function RequireAuth({ children }: { children: ReactNode }) {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        Vérification de la session…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
