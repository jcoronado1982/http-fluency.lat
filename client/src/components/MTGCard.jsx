import React from 'react';
import './MTGCard.css';

const MTGCard = ({
    name,
    manaCost,
    image,
    type: _type,
    setSymbol: _setSymbol,
    oracleText,
    flavorText,
    powerToughness,
    colorIdentity = 'gold', // 'red', 'blue', 'green', 'white', 'black', 'gold'
    children, // Allow custom content in text box
    footerText,
    imageControls // Slot for image controls
}) => {

    // Map color identity to CSS class
    const frameClass = `mtg-frame-${colorIdentity}`;

    return (
        <div className="mtg-card-container">
            <div className={`mtg-card-frame ${frameClass}`}>

                {/* Title Bar */}
                <div className="mtg-title-bar">
                    <span className="mtg-card-title">{name}</span>
                    <div className="mtg-mana-cost">
                        {manaCost}
                    </div>
                </div>

                {/* Art Box */}
                <div className="mtg-art-box">
                    {imageControls && <div className="mtg-controls-overlay">{imageControls}</div>}
                    {image}
                </div>

                {/* Type Line */}



                {/* Text Box */}
                <div className="mtg-text-box">
                    <div className="mtg-text-content">
                        {oracleText}
                        {children}
                    </div>
                    {flavorText && <div className="mtg-flavor-text">{flavorText}</div>}
                </div>

                {/* Footer (optional) */}
                <div className="mtg-footer">
                    <span>{footerText}</span>
                    {powerToughness && <span>{powerToughness}</span>}
                </div>

            </div>
        </div>
    );
};

export default MTGCard;
