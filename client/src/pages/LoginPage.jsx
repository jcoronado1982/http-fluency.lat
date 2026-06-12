import React, { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import { FiImage, FiVolume2, FiBook } from 'react-icons/fi';
import './LoginPage.css';

const LoginPage = () => {
    const { login, isAuthenticated } = useAuth();
    const navigate = useNavigate();
    const googleBtnRef = useRef(null);
    const callbackRef = useRef(null);

    // Guardar la última versión de la función de callback para evitar cierres obsoletos (stale closures)
    useEffect(() => {
        callbackRef.current = async (response) => {
            try {
                await login(response.credential);
                navigate('/');
            } catch {
                console.error("Login failed");
            }
        };
    }, [login, navigate]);

    useEffect(() => {
        if (isAuthenticated) {
            navigate('/');
        }
    }, [isAuthenticated, navigate]);

    useEffect(() => {
        let isMounted = true;

        const handleCallbackResponse = (response) => {
            if (callbackRef.current) {
                callbackRef.current(response);
            }
        };

        const initGoogle = () => {
            if (window.google && googleBtnRef.current) {
                // Inicializar solo una vez a nivel de ventana para evitar advertencias de inicialización múltiple
                if (!window.google_initialized) {
                    window.google.accounts.id.initialize({
                        client_id: "977952175712-i072hpkjgq51ualf0hlkgj4boa48f0mp.apps.googleusercontent.com",
                        callback: handleCallbackResponse
                    });
                    window.google_initialized = true;
                }

                window.google.accounts.id.renderButton(
                    googleBtnRef.current,
                    { theme: "outline", size: "large", shape: "rectangular", width: 320, text: "continue_with" }
                );
            } else if (isMounted) {
                setTimeout(initGoogle, 200);
            }
        };

        initGoogle();

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <div className="login-container">
            <div className="login-content">
                <div className="login-hero">
                    <img
                        src="/logo.avif"
                        alt="TheRuby"
                        className="login-logo"
                    />
                    <h1 className="login-brand-text">TheRuby</h1>
                    <p className="login-tagline">
                        El vocabulario que necesitas para hablar otro idioma.
                    </p>
                </div>

                <div className="login-features">
                    <div className="feature-card">
                        <div className="feature-icon">
                            <FiImage />
                        </div>
                        <span className="feature-text">Imágenes generadas con IA</span>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">
                            <FiVolume2 />
                        </div>
                        <span className="feature-text">Audio con acento nativo</span>
                    </div>
                    <div className="feature-card">
                        <div className="feature-icon">
                            <FiBook />
                        </div>
                        <span className="feature-text">+2,500 palabras esenciales</span>
                    </div>
                </div>

                <div className="login-footer-section">
                    <div className="google-btn-container" ref={googleBtnRef}></div>
                </div>
            </div>

            <div className="login-bg-glow login-bg-glow-top" aria-hidden="true" />
            <div className="bg-blob blob-1" aria-hidden="true" />
            <div className="bg-blob blob-2" aria-hidden="true" />
            <div className="login-bg-vignette" aria-hidden="true" />
        </div>
    );
};

export default LoginPage;
