import { useState } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "../features/auth/authContext";
import { authErrorMessage } from "../features/auth/authErrors";
import { AuthIcon } from "../features/auth/components/AuthIcon";
import { AuthField } from "../features/auth/components/AuthField";
import { AuthHeading, AuthLayout, AuthNotice } from "../features/auth/components/AuthLayout";

/**
 * « Mot de passe oublié ? » : envoie un lien de réinitialisation par e-mail.
 *
 * En développement, les e-mails de Supabase ne partent pas réellement : ils
 * arrivent dans Mailpit, http://127.0.0.1:56324.
 */
export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await sendPasswordReset(email.trim());
      // Même message, que le compte existe ou non : on ne révèle pas quelles
      // adresses sont inscrites.
      setSent(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Link to="/login" className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <AuthIcon name="arrow-left" size={16} />
          Retour à la connexion
        </Link>

        <AuthHeading
          title="Mot de passe oublié"
          subtitle="Indiquez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe."
        />

        {error && <AuthNotice tone="danger">{error}</AuthNotice>}
        {sent && (
          <AuthNotice tone="success">
            Si un compte existe pour {email}, un lien de réinitialisation vient de lui être envoyé.
          </AuthNotice>
        )}

        <AuthField
          label="Adresse e-mail"
          icon="envelope"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@etablissement.fr"
          autoComplete="email"
          required
          autoFocus
        />

        <button
          type="submit"
          className="wg-auth-btn wg-auth-btn-primary"
          disabled={submitting || !email.includes("@")}
        >
          {submitting ? "Envoi…" : sent ? "Renvoyer le lien" : "Envoyer le lien"}
          {!submitting && <AuthIcon name="arrow-right" size={16} />}
        </button>
      </form>
    </AuthLayout>
  );
}
