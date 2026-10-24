import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Dashboard from './pages/Dashboard';
import Viewer from './pages/Viewer';
import Login from './pages/Login';
import RadiologyViewer from './pages/RadiologyViewer';

// Pour la démo, on simule que l'utilisateur est connecté.
// ⚠️ Constante littérale : les gardes ci-dessous ne protègent donc rien.
// L'authentification reste à implémenter (voir docs/09-pieges-et-bugs.md).
const isAuthenticated = true;

function App() {
  // Aucune classe de couleur ici : le fond et la couleur du texte viennent de
  // `body` dans index.css, et changent avec le thème. Chaque page pose son
  // propre cadre (AppShell pour les écrans de navigation, plein écran pour les
  // visionneuses).
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />} />
        <Route path="/viewer" element={isAuthenticated ? <Viewer /> : <Navigate to="/login" />}/>
        <Route path="/radiology" element={isAuthenticated ? <RadiologyViewer /> : <Navigate to="/login" />}/>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </Router>
  );
}

export default App;
