import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Installe l'intercepteur axios qui joint le jeton de session aux appels du
// backend. Doit être importé avant tout appel à l'API.
import './services/http'
import App from './App.tsx'
import { ThemeProvider } from './features/theme/ThemeProvider.tsx'
import { AuthProvider } from './features/auth/AuthProvider.tsx'

// ThemeProvider enveloppe TOUTE l'application, routeur compris : le thème doit
// survivre à un changement de page, et la barre de navigation comme les
// graphiques doivent pouvoir le lire depuis n'importe quelle route.
// AuthProvider fait de même pour la session de l'utilisateur.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
