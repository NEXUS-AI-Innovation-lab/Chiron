import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';

import { useTheme } from '../features/theme/themeContext';
import Logo from '../components/Logo';

/**
 * Écran de connexion.
 *
 * Sobriété volontaire : un seul bloc centré, une seule action possible.
 * Rien ne doit détourner l'attention du champ à remplir.
 */
export default function Login() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [username, setUsername] = useState("");

  // L'identifiant saisi devient l'identité utilisée dans toute l'application
  // (auteur des annotations, signature des comptes rendus).
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;

    localStorage.setItem("biopsie_user", username);
    navigate('/dashboard');
  };

  return (
    <div className="flex min-h-screen flex-col bg-canvas">
      {/* Bascule de thème accessible dès la connexion : le choix est fait une
          fois pour toutes, avant même d'entrer dans l'application. */}
      <div className="flex justify-end p-4">
        <button
          type="button"
          onClick={toggleTheme}
          className="wg-btn wg-btn-quiet wg-btn-icon"
          title={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
          aria-label={theme === 'dark' ? 'Passer en thème clair' : 'Passer en thème sombre'}
        >
          {theme === 'dark' ? <LightModeIcon fontSize="small" /> : <DarkModeIcon fontSize="small" />}
        </button>
      </div>

      <div className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:items-center sm:pt-0">
        <div className="w-full max-w-sm">
          {/* Marque */}
          <div className="mb-8 flex items-center justify-center gap-3">
            {/* Ici le fond est celui de la page : la variante suit le theme. */}
            <Logo fond={theme === 'dark' ? 'sombre' : 'clair'} hauteur={56} />
            <div>
              <div className="text-lg font-semibold tracking-tight text-ink">Chiron.</div>
              <div className="text-xs text-muted">Plateforme collaborative</div>
            </div>
          </div>

          <form onSubmit={handleLogin} className="wg-card p-6">
            <h1 className="wg-h2 mb-1">Connexion</h1>
            <p className="wg-sub mb-6">
              Identifiez-vous pour accéder aux dossiers patients.
            </p>

            <div className="mb-4">
              <label className="wg-label" htmlFor="login-user">
                Identifiant médecin
              </label>
              <input
                id="login-user"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="wg-input"
                placeholder="Dr. Martin"
                autoComplete="username"
                required
              />
            </div>

            <div className="mb-6">
              <label className="wg-label" htmlFor="login-password">
                Mot de passe
              </label>
              <input
                id="login-password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                required
                className="wg-input"
              />
            </div>

            <button type="submit" className="wg-btn wg-btn-primary w-full">
              Se connecter
            </button>
          </form>

          {/* Mention honnête : le champ mot de passe n'est pas transmis, aucun
              service ne vérifie l'identité. Annoncer une certification que le
              système n'a pas serait trompeur pour un usage médical. */}
          <p className="mt-4 text-center text-xs text-faint">
            Environnement de démonstration. Ne déposez aucune donnée de patient réel.
          </p>
        </div>
      </div>
    </div>
  );
}
