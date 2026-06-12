
import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import './App.css';
// Triggering CI build with a dummy change
// Another trigger space

import Sidebar from './components/layout/Sidebar';
import Header from './components/layout/Header';
import Footer from './components/layout/Footer';
import FlashcardPage from './pages/FlashcardPage';
import GrammarPage from './pages/GrammarPage';
import TestPage from './pages/TestPage';
import CoursePage from './pages/CoursePage';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';
import ProtectedRoute from './components/common/ProtectedRoute';
import AdminRoute from './components/common/AdminRoute';
import config from './config';

const PronounPracticePage = React.lazy(() => import('./pages/PronounPracticePage'));


import { AppProvider, useAppContext } from './context/AppContext';
import { FlashcardProvider } from './context/FlashcardContext';

import CategorySelector from './features/flashcards/CategorySelector';
import IpaModal from './features/flashcards/IpaModal';
import PhonicsModal from './features/flashcards/PhonicsModal';

function AppContent() {
  const {
    isSidebarOpen, setIsSidebarOpen,
    isCatalogVisible, isIpaModalOpen, isPhonicsModalOpen,
    setIsIpaModalOpen
  } = useAppContext();
  const location = useLocation();
  const isLoginPage = location.pathname === '/login';

  return (
    <div className="app-layout">
      {!isLoginPage && <Sidebar />}

      {isSidebarOpen && (
        <div className="sidebar-overlay" onClick={() => setIsSidebarOpen(false)} />
      )}

      <div className={`main-content ${isSidebarOpen && !isLoginPage ? 'sidebar-open' : 'sidebar-closed'}`}>
        {!isLoginPage && <Header />}

        <main className="page-content">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
            <Route path="/flashcard" element={<ProtectedRoute><FlashcardPage /></ProtectedRoute>} />
            <Route path="/grammar" element={<ProtectedRoute><GrammarPage /></ProtectedRoute>} />
            <Route path="/test" element={<ProtectedRoute><TestPage /></ProtectedRoute>} />
            <Route path="/pronoun-reference" element={<ProtectedRoute><CoursePage /></ProtectedRoute>} />
            {config.features.storyArcade && (
              <Route 
                path="/pronoun-practice" 
                element={
                  <React.Suspense fallback={<div style={{ padding: '2rem', textAlign: 'center' }}>Loading Pronoun Practice...</div>}>
                    <ProtectedRoute><PronounPracticePage /></ProtectedRoute>
                  </React.Suspense>
                } 
              />
            )}
            <Route path="/" element={<Navigate to="/flashcard" replace />} />
          </Routes>
        </main>
        {!isLoginPage && <Footer />}
      </div>

      {isCatalogVisible && <CategorySelector />}
      {isIpaModalOpen && <IpaModal onClose={() => setIsIpaModalOpen(false)} />}
      {isPhonicsModalOpen && <PhonicsModal />}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <FlashcardProvider>
        <AppContent />
      </FlashcardProvider>
    </AppProvider>
  );
}

export default App; // trigger
