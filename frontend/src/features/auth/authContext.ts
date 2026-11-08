/**
 * Contexte d'authentification, séparé du composant Provider pour la même
 * raison que le thème (règle react-refresh/only-export-components).
 */

import { createContext, useContext } from "react";
import type { Session } from "@supabase/supabase-js";

/** Professions proposées à la création du compte. */
export const PROFESSIONS = [
  "Pathologiste",
  "Radiologue",
  "Interne",
  "Technicien de laboratoire",
  "Autre",
] as const;
export type Profession = (typeof PROFESSIONS)[number];

/** L'utilisateur connecté, tel que l'application l'affiche. */
export interface Profile {
  id: string;
  email: string;
  fullName: string;
  profession: string | null;
  /** Nom affiché partout : auteur des annotations, signataire, propriétaire. */
  displayName: string;
}

export interface SignUpInput {
  fullName: string;
  profession: Profession;
  email: string;
  password: string;
}

export interface AuthValue {
  /** `true` tant que la session enregistrée n'a pas été relue. */
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  signIn: (email: string, password: string, remember: boolean) => Promise<void>;
  /** Renvoie `true` si le compte est actif tout de suite, `false` s'il faut confirmer l'e-mail. */
  signUp: (input: SignUpInput) => Promise<boolean>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error("useAuth doit être utilisé dans <AuthProvider>.");
  }
  return value;
}

/**
 * Clé historique où l'application lit le nom de l'utilisateur
 * (Viewer, Dashboard, PatientCard, RadiologyViewer). AuthProvider la tient à
 * jour avec le nom du compte Supabase : ces écrans n'ont donc pas eu à être
 * réécrits. À remplacer à terme par `useAuth().profile.displayName`.
 */
export const LEGACY_USER_KEY = "biopsie_user";
