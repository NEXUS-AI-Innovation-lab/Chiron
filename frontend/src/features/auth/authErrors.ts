/**
 * Messages d'erreur de Supabase Auth, traduits pour l'utilisateur.
 *
 * On se base sur le `code` stable renvoyé par Supabase plutôt que sur le
 * texte anglais, qui peut changer d'une version à l'autre.
 */

import { AuthError } from "@supabase/supabase-js";

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Adresse e-mail ou mot de passe incorrect.",
  email_not_confirmed:
    "Votre adresse e-mail n'est pas encore confirmée. Ouvrez le lien reçu par e-mail.",
  user_already_exists: "Un compte existe déjà avec cette adresse e-mail.",
  email_exists: "Un compte existe déjà avec cette adresse e-mail.",
  weak_password:
    "Mot de passe trop faible : au moins 10 caractères, avec une minuscule, une majuscule et un chiffre.",
  same_password: "Le nouveau mot de passe doit être différent de l'ancien.",
  over_email_send_rate_limit:
    "Trop d'e-mails envoyés. Patientez quelques minutes avant de réessayer.",
  over_request_rate_limit: "Trop de tentatives. Patientez quelques minutes.",
  signup_disabled: "La création de compte est désactivée.",
  validation_failed: "Adresse e-mail invalide.",
  email_address_invalid: "Adresse e-mail invalide.",
  session_not_found: "Votre session a expiré. Recommencez la procédure.",
};

export function authErrorMessage(error: unknown): string {
  if (error instanceof AuthError) {
    if (error.code && MESSAGES[error.code]) return MESSAGES[error.code];
    if (error.status === 0 || error.name === "AuthRetryableFetchError") {
      return "Service d'authentification injoignable. Supabase est-il démarré ?";
    }
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return "Une erreur inattendue est survenue.";
}

/** Règle affichée sous un champ de mot de passe encore vide. */
export const PASSWORD_RULE = "10 caractères minimum, avec une minuscule, une majuscule et un chiffre.";

/** Mêmes règles que supabase/config.toml (minimum_password_length, password_requirements). */
export function passwordProblems(password: string): string[] {
  const problems: string[] = [];
  if (password.length < 10) problems.push("au moins 10 caractères");
  if (!/[a-z]/.test(password)) problems.push("une minuscule");
  if (!/[A-Z]/.test(password)) problems.push("une majuscule");
  if (!/[0-9]/.test(password)) problems.push("un chiffre");
  return problems;
}
