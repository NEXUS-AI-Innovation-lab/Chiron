import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Viewer from './pages/Viewer';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import RadiologyViewer from './pages/RadiologyViewer';
import { RequireAuth } from './features/auth/RequireAuth';

function App() {
  // Aucune classe de couleur ici : le fond et la couleur du texte viennent de
  // `body` dans index.css, et changent avec le thème. Chaque page pose son
  // propre cadre (AppShell pour les écrans de navigation, plein écran pour les
  // visionneuses).
  //
  // Les écrans métier sont protégés par RequireAuth : sans session Supabase,
  // redirection vers /login (docs/16-supabase.md).
  return (
    <Router>
      <Routes>
        {/* Publiques */}
        <Route path="/login" element={<Login />} />
        <Route path="/inscription" element={<Signup />} />
        <Route path="/mot-de-passe-oublie" element={<ForgotPassword />} />
        <Route path="/reinitialisation" element={<ResetPassword />} />

        {/* Réservées aux utilisateurs connectés */}
        <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/viewer" element={<RequireAuth><Viewer /></RequireAuth>} />
        <Route path="/radiology" element={<RequireAuth><RadiologyViewer /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  );
}

export default App;
