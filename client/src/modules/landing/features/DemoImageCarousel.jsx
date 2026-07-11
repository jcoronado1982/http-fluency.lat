import React from 'react';
import { Link } from 'react-router-dom';
import { buildLandingDemoImagePath } from '../../../contracts/landingDemoNamespace';

const TOP_ROW = [
    { src: buildLandingDemoImagePath(0, 1), width: 310, mobileWidth: 205 },
    { src: buildLandingDemoImagePath(1, 0), width: 340, mobileWidth: 225 },
    { src: buildLandingDemoImagePath(2, 0), width: 280, mobileWidth: 190 },
    { src: buildLandingDemoImagePath(3, 1), width: 250, mobileWidth: 174 },
    { src: buildLandingDemoImagePath(4, 0), width: 350, mobileWidth: 232 },
    { src: buildLandingDemoImagePath(5, 1), width: 230, mobileWidth: 160 },
    { src: buildLandingDemoImagePath(6, 0), width: 320, mobileWidth: 212 },
    { src: buildLandingDemoImagePath(7, 1), width: 210, mobileWidth: 150 },
];

const BOTTOM_ROW = [
    { src: buildLandingDemoImagePath(8, 0), width: 360, mobileWidth: 238 },
    { src: buildLandingDemoImagePath(4, 3), width: 215, mobileWidth: 150 },
    { src: buildLandingDemoImagePath(9, 0), width: 300, mobileWidth: 200 },
    { src: buildLandingDemoImagePath(1, 1, 'v2'), width: 285, mobileWidth: 192 },
    { src: buildLandingDemoImagePath(10, 0), width: 350, mobileWidth: 232 },
    { src: buildLandingDemoImagePath(2, 1, 'v3'), width: 260, mobileWidth: 180 },
    { src: buildLandingDemoImagePath(3, 0, 'v2'), width: 290, mobileWidth: 196 },
    { src: buildLandingDemoImagePath(6, 1), width: 220, mobileWidth: 154 },
];

function ImageGroup({ images, duplicate = false }) {
    return (
        <div className="lp-image-carousel-group" aria-hidden={duplicate || undefined}>
            {images.map((image, index) => (
                <div
                    className="lp-image-carousel-tile"
                    key={`${image.src}-${index}`}
                    style={{
                        '--lp-gallery-tile-width': `${image.width}px`,
                        '--lp-gallery-tile-mobile-width': `${image.mobileWidth}px`,
                        backgroundImage: `url(${image.src})`,
                    }}
                >
                    <img
                        src={image.src}
                        alt=""
                        loading={duplicate ? 'lazy' : 'eager'}
                        decoding="async"
                        draggable="false"
                    />
                </div>
            ))}
        </div>
    );
}

function ImageRow({ images, direction }) {
    return (
        <div className={`lp-image-carousel-row lp-image-carousel-row--${direction}`}>
            <div className="lp-image-carousel-track">
                <ImageGroup images={images} />
                <ImageGroup images={images} duplicate />
            </div>
        </div>
    );
}

export default function DemoImageCarousel({ t, pricingEnabled }) {
    return (
        <div className="lp-image-showcase">
            <div className="lp-image-showcase-heading">
                <span className="lp-image-showcase-badge">{t.premiumBadgeLabel}</span>
                <h2 className="lp-image-showcase-title">{t.imageShowcaseTitle}</h2>
                <p className="lp-image-showcase-subtitle">{t.imageShowcaseSubtitle}</p>
            </div>

            <div className="lp-image-carousel" aria-hidden="true">
                <ImageRow images={TOP_ROW} direction="left" />
                <ImageRow images={BOTTOM_ROW} direction="right" />
            </div>

            {pricingEnabled && (
                <div className="lp-image-showcase-cta">
                    <Link to="/pricing" className="lp-btn lp-btn--outline">
                        {t.seePremiumCta}
                    </Link>
                </div>
            )}
        </div>
    );
}
