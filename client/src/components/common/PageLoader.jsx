import React from 'react';
import styles from './PageLoader.module.css';

function PageLoader({
    title = 'Loading',
    subtitle = '',
    status = '',
    currentTask = '',
    progress = 0,
    className = '',
    theme = null,
    children = null,
}) {
    const resolvedProgress = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;

    return (
        <div className={`${styles.pageLoader} ${className}`.trim()} style={theme || undefined}>
            <section className={styles.panel} aria-live="polite" aria-busy="true">
                <div className={styles.topBar} aria-hidden="true">
                    <span className={styles.topBarGlow} />
                </div>

                <h1 className={styles.title}>{title}</h1>
                {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}

                <div className={styles.progressWrap} aria-hidden="true">
                    <div className={styles.progressTrack}>
                        <div className={styles.progressFill} style={{ width: `${resolvedProgress}%` }} />
                    </div>
                    <div className={styles.progressMeta}>
                        <span className={styles.progressLabel}>{status || currentTask}</span>
                        <span className={styles.progressPercent}>{resolvedProgress}%</span>
                    </div>
                </div>

                {children}
            </section>
        </div>
    );
}

export default PageLoader;
