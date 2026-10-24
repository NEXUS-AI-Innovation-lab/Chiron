import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ThemeProvider } from './features/theme/ThemeProvider.tsx'

// ThemeProvider enveloppe TOUTE l'application, routeur compris : le thème doit
// survivre à un changement de page, et la barre de navigation comme les
// graphiques doivent pouvoir le lire depuis n'importe quelle route.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </StrictMode>,
)
