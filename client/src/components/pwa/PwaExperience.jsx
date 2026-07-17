import { useCallback, useEffect, useMemo, useState } from 'react';
import { getInitialInterfaceLanguage } from '../../utils/browserLanguage';
import styles from './PwaExperience.module.css';

const INSTALL_DISMISS_KEY = 'fluency_pwa_install_dismissed_at';
const INSTALL_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const COPY = {
  es: {
    offline: 'Sin conexión. Conéctate para cargar otro mazo o contenido nuevo.',
    install: 'Instala Fluency para abrirla como una app.',
    installAction: 'Instalar',
    iosInstall: 'En iPhone: pulsa Compartir y luego “Añadir a pantalla de inicio”.',
    close: 'Cerrar',
  },
  en: {
    offline: 'You are offline. Connect to load another deck or new content.',
    install: 'Install Fluency to open it like an app.',
    installAction: 'Install',
    iosInstall: 'On iPhone: tap Share, then “Add to Home Screen”.',
    close: 'Close',
  },
};

const isStandalone = () => (
  window.matchMedia?.('(display-mode: standalone)').matches
  || window.navigator.standalone === true
);

const isIos = () => (
  /iphone|ipad|ipod/i.test(window.navigator.userAgent)
  || (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1)
);

const wasInstallRecentlyDismissed = () => {
  const dismissedAt = Number(window.localStorage.getItem(INSTALL_DISMISS_KEY));
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < INSTALL_DISMISS_TTL_MS;
};

export default function PwaExperience() {
  const copy = useMemo(() => COPY[getInitialInterfaceLanguage()] ?? COPY.en, []);
  const [isOnline, setIsOnline] = useState(() => window.navigator.onLine);
  const [installPrompt, setInstallPrompt] = useState(null);
  const [showIosInstall, setShowIosInstall] = useState(() => (
    isIos() && !isStandalone() && !wasInstallRecentlyDismissed()
  ));

  useEffect(() => {
    if ('serviceWorker' in window.navigator && import.meta.env.PROD) {
      window.navigator.serviceWorker.register('/sw.js', { scope: '/' })
        .catch((error) => console.warn('[pwa] No se pudo registrar el service worker:', error));
    }

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    const handleInstallPrompt = (event) => {
      event.preventDefault();
      if (!isStandalone() && !wasInstallRecentlyDismissed()) {
        setInstallPrompt(event);
      }
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowIosInstall(false);
      window.localStorage.removeItem(INSTALL_DISMISS_KEY);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, []);

  const dismissInstall = useCallback(() => {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, String(Date.now()));
    setInstallPrompt(null);
    setShowIosInstall(false);
  }, []);

  const requestInstall = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice.catch(() => null);
    if (choice?.outcome !== 'accepted') dismissInstall();
    setInstallPrompt(null);
  }, [dismissInstall, installPrompt]);

  if (!isOnline) {
    return (
      <aside className={`${styles.notice} ${styles.offline}`} role="status" aria-live="polite">
        <span className={styles.statusDot} aria-hidden="true" />
        <p>{copy.offline}</p>
      </aside>
    );
  }

  if (installPrompt || showIosInstall) {
    return (
      <aside className={styles.notice} role="status" aria-live="polite">
        <p>{showIosInstall ? copy.iosInstall : copy.install}</p>
        <div className={styles.actions}>
          {installPrompt && (
            <button type="button" className={styles.primaryAction} onClick={requestInstall}>
              {copy.installAction}
            </button>
          )}
          <button type="button" className={styles.secondaryAction} onClick={dismissInstall}>
            {copy.close}
          </button>
        </div>
      </aside>
    );
  }

  return null;
}
