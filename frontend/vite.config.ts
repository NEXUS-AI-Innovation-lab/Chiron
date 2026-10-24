import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    watch: {
      usePolling: true
    },
    proxy: {
      '/orthanc': {
        target: 'http://p6_orthanc:8042', 
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/orthanc/, ''),
        // Orthanc protege son API par une auth HTTP Basic. Sans cet en-tete le
        // navigateur affiche sa propre fenetre de connexion a chaque session.
        // Identifiants par defaut de l'image, surchargeables par .env :
        //   VITE_ORTHANC_USER / VITE_ORTHANC_PASSWORD
        // Valable en developpement uniquement : en production, l'auth ne doit
        // pas transiter par le serveur de dev Vite.
        auth: `${process.env.VITE_ORTHANC_USER || 'orthanc'}:${process.env.VITE_ORTHANC_PASSWORD || 'orthanc'}`,
      }
    },
  },
})