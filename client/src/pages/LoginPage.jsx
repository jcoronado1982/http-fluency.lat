import React, { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FiImage, FiVolume2, FiBook } from 'react-icons/fi';
import './LoginPage.css';

import config from '../config';
import { getAuthenticatedHomePath } from '../modules';
import { useAuth } from '../context/AuthContext';
import PageLoader from '../components/common/PageLoader';

const GOOGLE_CLIENT_ID =
    import.meta.env.VITE_GOOGLE_CLIENT_ID ||
    '977952175712-i072hpkjgq51ualf0hlkgj4boa48f0mp.apps.googleusercontent.com';

const LoginPage = () => {
    const { login, isAuthenticated, loading } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const googleBtnRef = useRef(null);
    const callbackRef = useRef(null);
    const shellRoutes = [{ path: '/admin', enabled: config.features.admin }];
    const defaultPath = getAuthenticatedHomePath(config, shellRoutes);
    const targetPath = location.state?.from || defaultPath;

    useEffect(() => {
        callbackRef.current = async (response) => {
            try {
                await login(response.credential);
                navigate(targetPath, { replace: true });
            } catch {
                console.error('Login failed');
            }
        };
    }, [login, navigate, targetPath]);

    useEffect(() => {
        if (loading || !isAuthenticated) return;
        if (location.pathname === targetPath) return;
        navigate(targetPath, { replace: true });
    }, [isAuthenticated, loading, navigate, targetPath, location.pathname]);

    useEffect(() => {
        let isMounted = true;
        let resizeObserver = null;

        const handleCallbackResponse = (response) => {
            callbackRef.current?.(response);
        };

        const renderGoogleButton = () => {
            const container = googleBtnRef.current;
            if (!window.google?.accounts?.id || !container) return;

            const width = Math.max(
                200,
                Math.min(320, Math.floor(container.getBoundingClientRect().width) || 320)
            );

            container.replaceChildren();

            window.google.accounts.id.renderButton(container, {
                theme: 'outline',
                size: 'large',
                shape: 'rectangular',
                width,
                text: 'continue_with',
            });
        };

        const initGoogle = () => {
            if (window.google?.accounts?.id && googleBtnRef.current) {
                if (!window.google_initialized) {
                    window.google.accounts.id.initialize({
                        client_id: GOOGLE_CLIENT_ID,
                        callback: handleCallbackResponse,
                        use_fedcm_for_prompt: false,
                    });
                    window.google_initialized = true;
                }

                renderGoogleButton();

                if (typeof ResizeObserver !== 'undefined') {
                    resizeObserver = new ResizeObserver(renderGoogleButton);
                    resizeObserver.observe(googleBtnRef.current);
                }
            } else if (isMounted) {
                setTimeout(initGoogle, 200);
            }
        };

        initGoogle();

        return () => {
            isMounted = false;
            resizeObserver?.disconnect();
        };
    }, []);

    if (loading) {
        return (
            <PageLoader
                title="Validating access"
                subtitle="We are preparing your access."
                status="Checking your session..."
                progress={56}
            />
        );
    }

    return (
        <div className="login-container">
            <div className="login-content">
                <div className="login-hero">
                    <img
                        src="/logo.avif"
                        alt="TheRuby"
                        className="login-logo"
                    />
                    <h1 className="login-brand-text">Fluency</h1>
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
                        <span className="feature-text">Más de 5,000 palabras esenciales</span>
                    </div>
                </div>

                <div className="login-footer-section">
                    <div className="google-btn-container" ref={googleBtnRef} />
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
