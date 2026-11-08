import { useState } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";

import { useAuth } from "../features/auth/authContext";
import { authErrorMessage } from "../features/auth/authErrors";
import { getRememberMe } from "../features/auth/supabaseClient";
import { AuthIcon } from "../features/auth/components/AuthIcon";
import { AuthCheckbox, AuthField } from "../features/auth/components/AuthField";
import { AuthFootnote, AuthHeading, AuthLayout, AuthNotice } from "../features/auth/components/AuthLayout";

/**
 * Écran de connexion, d'après la maquette Figma « 01 · Connexion ».
 *
 * L'identité est vérifiée par Supabase Auth (e-mail + mot de passe). Écart
 * assumé avec la maquette : le champ « Identifiant » demande l'adresse
 * e-mail, qui est l'identifiant des comptes Supabase.
 */
export default function Login() {
  const { session, signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(getRememberMe);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Page demandée avant la redirection vers /login (voir RequireAuth).
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? "/dashboard";
  // Message laissé par l'écran de réinitialisation du mot de passe.
  const notice = (location.state as { notice?: string } | null)?.notice;

  if (session) return <Navigate to={from} replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email.trim(), password, remember);
      navigate(from, { replace: true });
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <AuthHeading title="Connexion" subtitle="Identifiez-vous pour retrouver votre file de travail." />

        {notice && !error && <AuthNotice tone="success">{notice}</AuthNotice>}
        {error && <AuthNotice tone="danger">{error}</AuthNotice>}

        <AuthField
          label="Identifiant (adresse e-mail)"
          icon="user"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@etablissement.fr"
          autoComplete="username"
          required
          autoFocus
        />

        <AuthField
          label="Mot de passe"
          icon="lock-simple"
          revealable
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          autoComplete="current-password"
          required
        />

        <div className="flex items-center gap-2.5">
          <AuthCheckbox checked={remember} onChange={setRemember}>
            Se souvenir de moi
          </AuthCheckbox>
          <div className="flex-1" />
          <Link to="/mot-de-passe-oublie" className="text-sm font-bold text-accent-text hover:underline">
            Mot de passe oublié ?
          </Link>
        </div>

        <button
          type="submit"
          className="wg-auth-btn wg-auth-btn-primary"
          disabled={submitting || !email.trim() || !password}
        >
          {submitting ? "Connexion…" : "Se connecter"}
          {!submitting && <AuthIcon name="arrow-right" size={16} />}
        </button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-line" />
          <span className="text-[13px] text-faint">ou</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        {/* Pro Santé Connect n'est pas encore branché : le bouton de la
            maquette est affiché, mais désactivé et annoncé comme tel, plutôt
            qu'un bouton qui ne ferait rien. */}
        <button
          type="button"
          className="wg-auth-btn wg-auth-btn-outline"
          disabled
          title="Bientôt disponible"
        >
          <AuthIcon name="first-aid" size={18} className="text-accent-text" />
          Se connecter avec Pro Santé Connect
          <span className="wg-chip">Bientôt</span>
        </button>

        <p className="text-center text-sm text-muted">
          Pas encore de compte ?{" "}
          <Link to="/inscription" className="font-bold text-accent-text hover:underline">
            Créer un compte
          </Link>
        </p>

        <AuthFootnote>Accès réservé aux professionnels de santé de l'établissement.</AuthFootnote>
      </form>
    </AuthLayout>
  );
}
