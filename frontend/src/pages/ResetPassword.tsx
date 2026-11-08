import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAuth } from "../features/auth/authContext";
import { PASSWORD_RULE, authErrorMessage, passwordProblems } from "../features/auth/authErrors";
import { AuthIcon } from "../features/auth/components/AuthIcon";
import { AuthField } from "../features/auth/components/AuthField";
import { AuthHeading, AuthLayout, AuthNotice } from "../features/auth/components/AuthLayout";

/**
 * Choix d'un nouveau mot de passe, au retour du lien reçu par e-mail.
 *
 * Le lien contient un jeton temporaire que le client Supabase lit dans l'URL
 * (`detectSessionInUrl`) : l'utilisateur est alors connecté pour cette seule
 * opération. Sans ce jeton (page ouverte directement), on le renvoie vers
 * « Mot de passe oublié ».
 */
export default function ResetPassword() {
  const { loading, session, updatePassword, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const problems = passwordProblems(password);
  const mismatch = confirmation.length > 0 && confirmation !== password;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await updatePassword(password);
      // On repart d'une session propre, ouverte avec le nouveau mot de passe.
      await signOut();
      navigate("/login", {
        replace: true,
        state: { notice: "Mot de passe modifié. Connectez-vous avec le nouveau." },
      });
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  if (!loading && !session) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-5">
          <AuthHeading title="Lien expiré" subtitle="Ce lien de réinitialisation n'est plus valable." />
          <Link to="/mot-de-passe-oublie" className="wg-auth-btn wg-auth-btn-primary">
            Demander un nouveau lien
            <AuthIcon name="arrow-right" size={16} />
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <AuthHeading title="Nouveau mot de passe" subtitle="Choisissez le mot de passe de votre compte." />

        {error && <AuthNotice tone="danger">{error}</AuthNotice>}

        <AuthField
          label="Nouveau mot de passe"
          icon="lock-simple"
          revealable
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          autoFocus
          invalid={password.length > 0 && problems.length > 0}
          hint={
            password.length === 0
              ? PASSWORD_RULE
              : problems.length === 0
                ? "Mot de passe conforme."
                : `Il manque : ${problems.join(", ")}.`
          }
        />

        <AuthField
          label="Confirmer le mot de passe"
          icon="lock-simple"
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="new-password"
          required
          invalid={mismatch}
          hint={mismatch ? "Les deux mots de passe sont différents." : undefined}
        />

        <button
          type="submit"
          className="wg-auth-btn wg-auth-btn-primary"
          disabled={submitting || loading || problems.length > 0 || confirmation !== password}
        >
          {submitting ? "Enregistrement…" : "Enregistrer le mot de passe"}
          {!submitting && <AuthIcon name="arrow-right" size={16} />}
        </button>
      </form>
    </AuthLayout>
  );
}
