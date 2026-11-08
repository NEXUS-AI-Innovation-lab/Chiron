import { useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";

import { PROFESSIONS, useAuth, type Profession } from "../features/auth/authContext";
import { PASSWORD_RULE, authErrorMessage, passwordProblems } from "../features/auth/authErrors";
import { AuthIcon } from "../features/auth/components/AuthIcon";
import { AuthField, AuthSelect } from "../features/auth/components/AuthField";
import { AuthFootnote, AuthHeading, AuthLayout, AuthNotice } from "../features/auth/components/AuthLayout";

/**
 * Création de compte.
 *
 * La maquette Figma n'a pas d'écran dédié : celui-ci reprend exactement le
 * gabarit de « 01 · Connexion » (panneau, champs, boutons, typographie).
 *
 * Le nom et la profession sont enregistrés dans les métadonnées du compte
 * Supabase. Le nom devient l'identité affichée partout dans l'application
 * (auteur des annotations, propriétaire des extractions, signataire).
 */
export default function Signup() {
  const { session, signUp } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [profession, setProfession] = useState<Profession>("Pathologiste");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingConfirmation, setPendingConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (session) return <Navigate to="/dashboard" replace />;

  const problems = passwordProblems(password);
  const mismatch = confirmation.length > 0 && confirmation !== password;
  const valid = fullName.trim().length >= 2 && email.includes("@") && problems.length === 0 && confirmation === password;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (!valid) return;
    setSubmitting(true);
    try {
      const active = await signUp({ fullName, profession, email: email.trim(), password });
      if (active) navigate("/dashboard", { replace: true });
      else setPendingConfirmation(true);
    } catch (cause) {
      setError(authErrorMessage(cause));
    } finally {
      setSubmitting(false);
    }
  };

  if (pendingConfirmation) {
    return (
      <AuthLayout>
        <div className="flex flex-col gap-5">
          <AuthHeading title="Vérifiez vos e-mails" subtitle={`Un lien de confirmation a été envoyé à ${email}.`} />
          <AuthNotice tone="success">
            Ouvrez ce lien pour activer votre compte, puis connectez-vous.
          </AuthNotice>
          <Link to="/login" className="wg-auth-btn wg-auth-btn-primary">
            Aller à la connexion
            <AuthIcon name="arrow-right" size={16} />
          </Link>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout>
      <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
        <Link to="/login" className="flex w-fit items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink">
          <AuthIcon name="arrow-left" size={16} />
          Retour à la connexion
        </Link>

        <AuthHeading title="Créer un compte" subtitle="Rejoignez la file de travail de votre établissement." />

        {error && <AuthNotice tone="danger">{error}</AuthNotice>}

        <AuthField
          label="Nom affiché"
          icon="user"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Dr Prénom Nom"
          autoComplete="name"
          required
          autoFocus
          invalid={touched && fullName.trim().length < 2}
          hint="Signe vos annotations et vos comptes rendus."
        />

        <AuthSelect
          label="Profession"
          icon="microscope"
          value={profession}
          options={PROFESSIONS}
          onChange={(value) => setProfession(value as Profession)}
        />

        <AuthField
          label="Adresse e-mail professionnelle"
          icon="envelope"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="prenom.nom@etablissement.fr"
          autoComplete="email"
          required
          invalid={touched && !email.includes("@")}
        />

        <AuthField
          label="Mot de passe"
          icon="lock-simple"
          revealable
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••••"
          autoComplete="new-password"
          required
          invalid={touched && problems.length > 0}
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
          placeholder="••••••••••"
          autoComplete="new-password"
          required
          invalid={mismatch || (touched && confirmation !== password)}
          hint={mismatch ? "Les deux mots de passe sont différents." : undefined}
        />

        <button type="submit" className="wg-auth-btn wg-auth-btn-primary" disabled={submitting}>
          {submitting ? "Création du compte…" : "Créer mon compte"}
          {!submitting && <AuthIcon name="arrow-right" size={16} />}
        </button>

        <p className="text-center text-sm text-muted">
          Déjà un compte ?{" "}
          <Link to="/login" className="font-bold text-accent-text hover:underline">
            Se connecter
          </Link>
        </p>

        <AuthFootnote>Accès réservé aux professionnels de santé de l'établissement.</AuthFootnote>
      </form>
    </AuthLayout>
  );
}
