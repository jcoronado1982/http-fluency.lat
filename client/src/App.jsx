
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './App.css';

import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import GrammarPage from './pages/GrammarPage';
import TestPage from './pages/TestPage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/common/ProtectedRoute';
import AdminRoute from './components/common/AdminRoute';
import config from './config';
import { getAppRoutes, getModuleOverlays, getDefaultAppPath, getModuleShellProviders } from './modules';

import { AppProvider, useAppContext } from './context/AppContext';

const shellRoutes = [
  {
    path: '/admin',
    enabled: config.features.admin,
    element: <AdminRoute><AdminPage /></AdminRoute>,
  },
];

const labRoutes = [
  {
    path: '/grammar',
    enabled: config.features.grammar,
    element: <ProtectedRoute><GrammarPage /></ProtectedRoute>,
  },
  {
    path: '/test',
    enabled: config.features.tests,
    element: <ProtectedRoute><TestPage /></ProtectedRoute>,
  },
];

const baseRoutes = [...shellRoutes, ...labRoutes];
const enabledRoutes = getAppRoutes(config, baseRoutes).filter(
  (route) => route.enabled !== false,
);
const defaultPath = getDefaultAppPath(config, baseRoutes);
const moduleOverlays = getModuleOverlays(config);
const moduleShellProviders = getModuleShellProviders(config);

function AppContent() {
  const { isSidebarOpen, setIsSidebarOpen, isMainLoadingBlocked } = useAppContext();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';
  const isShellBlocked = !isLoginPage && isMainLoadingBlocked;

  return (
    <div className="app-layout">
      {!isLoginPage && !isShellBlocked && <Sidebar />}

      {isSidebarOpen && !isShellBlocked && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`main-content ${isSidebarOpen && !isLoginPage ? 'sidebar-open' : 'sidebar-closed'}`}>
        {!isLoginPage && !isShellBlocked && <Header />}

        <main className="page-content">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            {enabledRoutes
              .map((route) => (
                <Route key={route.path} path={route.path} element={route.element} />
              ))}

            {!enabledRoutes.some((route) => route.path === '/') && (
              <Route path="/" element={<Navigate to={defaultPath} replace />} />
            )}
            <Route path="/flashcard" element={<Navigate to={defaultPath} replace />} />
            <Route path="*" element={<Navigate to={defaultPath} replace />} />
          </Routes>
        </main>
        {!isLoginPage && !isShellBlocked && <Footer />}
      </div>

      {!isShellBlocked && moduleOverlays.map((overlay, index) => (
        <React.Fragment key={index}>{overlay}</React.Fragment>
      ))}
    </div>
  );
}

function App() {
  let content = (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );

  moduleShellProviders.forEach((Provider, index) => {
    content = <Provider key={Provider.name || index}>{content}</Provider>;
  });

  return content;
}

export default App;
