import React from 'react';
import './Footer.css';

const Footer = () => {
    return (
        <footer className="app-footer">
            <div className="footer-content">
                <div className="footer-info">
                    <p className="copyright">&copy; 2026 by Jesus Coronado.</p>
                    <p className="version">Version 1.0.0-Beta</p>
                </div>
                <div className="footer-links">
                    <a href="/documentation" className="footer-link">Documentation</a>
                    <span className="divider">|</span>
                    <a href="https://www.fluency.lat/" target="_blank" rel="noopener noreferrer" className="footer-link">Portfolio</a>
                    <span className="divider">|</span>
                    <a href="https://github.com/jcoronado1982/flashcard-client" target="_blank" rel="noopener noreferrer" className="footer-link">GitHub</a>
                </div>
            </div>
        </footer>
    );
};

export default Footer;
