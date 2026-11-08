/**
 * Fournit la session Supabase à toute l'application.
 *
 * Source de vérité : `supabase.auth`. Ce composant :
 *   - relit la session enregistrée au démarrage, puis suit ses changements
 *     (connexion, déconnexion, rafraîchissement du jeton) ;
 *   - en déduit le profil affiché (nom, profession) à partir des métadonnées
 *     saisies à la création du compte ;
 *   - recopie le nom dans la clé historique `biopsie_user`, lue par les écrans
 *     existants ;
 *   - déconnecte l'utilisateur si le backend refuse son jeton (événement
 *     `chiron:non-authentifie` émis par services/http.ts).
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";

import {
  AuthContext,
  LEGACY_USER_KEY,
  type AuthValue,
  type Profile,
  type SignUpInput,
} from "./authContext";
import { setRememberMe, supabase } from "./supabaseClient";
import { UNAUTHORIZED_EVENT } from "../../services/http";

function profileOf(user: User): Profile {
  const meta = user.user_metadata ?? {};
  const fullName = String(meta.full_name ?? "").trim();
  return {
    id: user.id,
    email: user.email ?? "",
    fullName,
    profession: meta.profession ?? null,
    displayName: fullName || user.email || "Utilisateur",
  };
}

/** Garde la clé historique alignée sur la session (voir LEGACY_USER_KEY). */
function syncLegacyUser(session: Session | null): void {
  try {
    if (session) localStorage.setItem(LEGACY_USER_KEY, profileOf(session.user).displayName);
    else localStorage.removeItem(LEGACY_USER_KEY);
  } catch {
    /* stockage indisponible */
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      syncLegacyUser(data.session);
      setSession(data.session);
      setLoading(false);
    });

    // La clé historique est mise à jour AVANT le changement d'état : quand
    // les écrans protégés s'affichent, ils lisent déjà le bon nom.
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      syncLegacyUser(next);
      setSession(next);
    });

    const onUnauthorized = () => {
      void supabase.auth.signOut();
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string, remember: boolean) => {
    // Le choix doit être fait AVANT la connexion : c'est à ce moment que
    // Supabase écrit la session dans le stockage.
    setRememberMe(remember);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
  }, []);

  const signUp = useCallback(async (input: SignUpInput) => {
    setRememberMe(true);
    const { data, error } = await supabase.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        // Stocké dans user_metadata, donc dans le jeton : le backend lit le
        // nom de l'utilisateur sans requête supplémentaire.
        data: { full_name: input.fullName.trim(), profession: input.profession },
      },
    });
    if (error) throw error;
    // Sans session, Supabase attend la confirmation de l'adresse e-mail.
    return Boolean(data.session);
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const sendPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reinitialisation`,
    });
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      loading,
      session,
      profile: session ? profileOf(session.user) : null,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updatePassword,
    }),
    [loading, session, signIn, signUp, signOut, sendPasswordReset, updatePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
