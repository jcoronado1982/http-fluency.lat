//! Prompts de imagen **solo para el landing demo** (`landing-demo`).
//! Copia inicial del pipeline de producción — modificar aquí sin afectar flashcards internos.

/// Modelo Nano Banana Pro (Interactions API) — solo demo landing.
pub const GEMINI_IMAGE_MODEL: &str = "gemini-3-pro-image";
pub const GEMINI_IMAGE_ASPECT_RATIO: &str = "3:2";
/// Mínimo soportado por Pro (1K); el backend normaliza a 768x512 AVIF como Flux.
pub const GEMINI_IMAGE_SIZE: &str = "1K";
/// Mismo target que Flux / tarjetas internas.
pub const CARD_IMAGE_WIDTH: u32 = 768;
pub const CARD_IMAGE_HEIGHT: u32 = 512;
pub const CARD_IMAGE_AVIF_QUALITY: u8 = 80;

fn image_generation_config() -> String {
    format!(
        "Image generation config: response_format aspect_ratio {}, image_size {}; backend delivery target {}x{} AVIF quality {}.",
        GEMINI_IMAGE_ASPECT_RATIO,
        GEMINI_IMAGE_SIZE,
        CARD_IMAGE_WIDTH,
        CARD_IMAGE_HEIGHT,
        CARD_IMAGE_AVIF_QUALITY
    )
}

/// System prompt Gemini → descripción visual (copia de producción).
pub const GEMINI_SYSTEM: &str = r#"You are a "Real-Life Context" Visual Prompt Engineer for FLUX 2.

INPUT FORMAT (always provided):
WORD/PHRASE: [word]
POS/CATEGORY: [category]
MEANING: [meaning]
EXAMPLE: [example sentence]

STEP 0 — SELECT VISUAL STRATEGY based on POS/CATEGORY:
- nouns (concrete)  -> show the object in natural human use (hands, body, setting)
- nouns (abstract)  -> show a scene that EMBODIES the concept emotionally
- verbs             -> freeze the person MID-ACTION — not before, not after
- adjectives        -> use contrast or an extreme example to make the quality unmistakable
- adverbs           -> show someone doing an action in that specific WAY
- pronouns/possessives -> The word has NO visual meaning alone. You MUST show PEOPLE and their RELATIONSHIP to the object or action:
                     1st person (my, our) = owner(s) clearly IN frame, with hands, body position, gaze, or proximity showing ownership
                     2nd person (you, your) = the addressed person is visibly central, often facing the camera or receiving attention from another person
                     3rd person (his, her, their) = owner(s) observed from outside, with facial features, clothing, posture, and nearby object making the relationship clear
- prepositions      -> make the spatial/relational concept the visual star
- articles          -> show specificity (the) vs generality (a) through selection/pointing

If the POS is not perfectly matched by the category, infer the best visual strategy.

STEP 1 — BRAINSTORM: What is the most common, everyday slice-of-life scenario using the strategy above?
STEP 2 — DESCRIBE: Write a candid, unposed photograph description.
- Use the EXAMPLE as the main visual source when it exists; represent the phrase as it would appear in daily life, not as an abstract symbol.
- Include concrete people details: approximate age, face visibility, expression, gaze direction, posture, hand placement, clothing, and who owns or interacts with what.
- Include concrete environment details: room or street type, time of day, background objects, realistic surfaces, and lived-in imperfections.
- Focus on EXPRESSIONS, authentic DETAILS (messy rooms, real textures), and realistic lighting.
- Facial expressions must be neutral by default. Only show obvious emotions like crying, laughter, fear, anger, or sadness if the sentence explicitly requires them.
- Avoid studio perfection. Look like a candid documentary shot.
- GEOMETRIC PLAUSIBILITY & LOGIC: Never place backgrounds, screens, blackboards, whiteboards, presentation slides, or other key setting elements behind the subjects if doing so violates the real-world logic or layout of the location. For example, in a movie theater, the screen is always in front of the audience, NEVER behind them. Do not describe the movie screen behind the audience's seats just to show it. Instead, show the audience facing forward in their theater seats, holding popcorn, and let the lighting, theater seats, and popcorn establish the cinema context. If the camera faces the subjects to capture their expressions, any background setting elements must either be omitted or shown from a plausible side angle, rather than physically impossible placements.
- Absolutely NO TEXT, words, signs, or labels in the image.

Output ONLY one detailed final scene description (120-170 words) in English."#;

/// Demo con complemento del usuario: EXAMPLE manda, COMPLEMENT se suma (puede venir en español).
pub const GEMINI_SYSTEM_COMPLEMENT_MODE: &str = r#"You write photorealistic image scene descriptions for an English flashcard demo.

INPUT:
- EXAMPLE: card sentence — PRIMARY scene. Picture this sentence first (people, place, era, mood).
- SCENE COMPLEMENT: user notes (often Spanish) — MANDATORY extras to ADD on top of the example.

Rules (strict):
1. Start from EXAMPLE. The image must clearly illustrate that sentence.
2. ADD every detail from SCENE COMPLEMENT (translate to English in your output). Never drop people/objects/places from the complement.
3. If complement says outside/fuera/afuera/exterior/jardín — scene is OUTDOORS, not an empty indoor room.
4. If complement mentions niño/nino/boy, padres/parents, familia/family — show them visibly in frame.
5. Do not replace the example with an unrelated metaphor (e.g. a toy instead of real people when complement asks for people).
6. Facial expressions must be neutral by default. Only show obvious emotions like crying, laughter, fear, anger, or sadness if EXAMPLE explicitly requires them.
7. Output ONE paragraph, 75-110 words, English only. No text/signs in the image."#;

/// Mensaje user para Gemini (misma forma que producción).
pub fn build_gemini_user_message(
    phrase: &str,
    pos_category: &str,
    meaning: Option<&str>,
    usage_example: Option<&str>,
) -> String {
    build_gemini_user_message_with_complement(phrase, pos_category, meaning, usage_example, None)
}

pub fn build_gemini_user_message_with_complement(
    phrase: &str,
    pos_category: &str,
    meaning: Option<&str>,
    usage_example: Option<&str>,
    scene_complement: Option<&str>,
) -> String {
    let mut user = format!(
        "WORD/PHRASE: \"{}\"\nPOS/CATEGORY: \"{}\"",
        phrase, pos_category
    );
    if let Some(m) = meaning {
        user.push_str(&format!("\nMEANING: \"{}\"", m));
    }
    if let Some(u) = usage_example {
        user.push_str(&format!("\nEXAMPLE: \"{}\"", u));
    }
    if let Some(c) = scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
        user.push_str(&format!("\nSCENE COMPLEMENT: \"{}\"", c));
    }
    user
}

/// Solo EXAMPLE + COMPLEMENT (sin estrategia POS genérica).
pub fn build_complement_mode_user_message(
    usage_example: &str,
    meaning: Option<&str>,
    scene_complement: &str,
) -> String {
    let mut user = format!(
        "EXAMPLE (primary — anchor the whole image on this sentence): \"{}\"",
        usage_example
    );
    if let Some(m) = meaning.filter(|s| !s.is_empty()) {
        user.push_str(&format!("\nMEANING: \"{}\"", m));
    }
    user.push_str(&format!(
        "\nSCENE COMPLEMENT (mandatory additions on top of the example): \"{}\"",
        scene_complement.trim()
    ));
    user
}

pub fn gemini_system_for_landing(scene_complement: Option<&str>) -> String {
    if scene_complement
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .is_some()
    {
        GEMINI_SYSTEM_COMPLEMENT_MODE.to_string()
    } else {
        GEMINI_SYSTEM.to_string()
    }
}

pub fn suggests_outdoor_scene(text: &str) -> bool {
    let t = text.to_lowercase();
    [
        "outside",
        "outdoor",
        "exterior",
        "fuera",
        "afuera",
        "jardín",
        "jardin",
        "garden",
        "yard",
        "street",
        "calle",
        "patio",
        "lawn",
        "césped",
        "cesped",
        "playa",
        "beach",
        "frente a",
        "in front of",
    ]
    .iter()
    .any(|k| t.contains(k))
}

pub fn fallback_demo_visual_description(
    usage_example: &str,
    scene_complement: Option<&str>,
) -> String {
    let mut desc = format!(
        "Candid photograph illustrating the English sentence: \"{}\".",
        usage_example
    );
    if let Some(c) = scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
        desc.push_str(&format!(" The scene must also clearly show: {}.", c));
    }
    desc
}

/// Prompt final enviado al modelo de imagen del demo.
pub fn build_demo_image_prompt(visual_description: &str, scene_complement: Option<&str>) -> String {
    let lighting = scene_complement
        .filter(|c| suggests_outdoor_scene(c))
        .map(|_| "natural outdoor daylight")
        .unwrap_or("natural lighting suited to the scene");

    let mut prompt = format!(
        "Candid photorealistic DSLR photograph, {}, authentic textures: {}. {} \
        A realistic, unposed, everyday life scene. Faces should look neutral unless the sentence explicitly requires a specific emotion. No text, no words, no letters, no captions, no signage, no watermarks.",
        lighting,
        visual_description,
        image_generation_config()
    );

    if let Some(c) = scene_complement.map(str::trim).filter(|s| !s.is_empty()) {
        prompt.push_str(&format!(" CRITICAL — visibly include ALL of: {}.", c));
    }

    prompt
}

/// Prompt final enviado a `gemini-3-pro-image` en el demo (copia de la plantilla Flux/Comfy).
pub fn build_comfy_prompt(visual_description: &str) -> String {
    build_demo_image_prompt(visual_description, None)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn demo_user_message_includes_scene_complement() {
        let msg = build_gemini_user_message_with_complement(
            "I had a big house when I was young.",
            "landing-demo",
            Some("Pasado de tener"),
            Some("I had a big house when I was young."),
            Some("un niño y su familia en una casa grande"),
        );
        assert!(msg.contains("EXAMPLE:"));
        assert!(msg.contains("SCENE COMPLEMENT:"));
        assert!(msg.contains("niño"));
    }

    #[test]
    fn complement_mode_user_message_is_example_first() {
        let msg = build_complement_mode_user_message(
            "I had a big house when I was young.",
            Some("Past tense of have"),
            "coloca a nino y sus padres fuera en una casa grande",
        );
        assert!(msg.starts_with("EXAMPLE"));
        assert!(msg.contains("SCENE COMPLEMENT"));
        assert!(msg.contains("fuera"));
    }

    #[test]
    fn detects_outdoor_complement() {
        assert!(suggests_outdoor_scene(
            "coloca a nino fuera en una casa grande"
        ));
        assert!(!suggests_outdoor_scene("un niño en la cocina"));
    }

    #[test]
    fn demo_image_prompt_uses_outdoor_light_for_fuera() {
        let p = build_demo_image_prompt("A family at a large house.", Some("nino y padres fuera"));
        assert!(p.contains("outdoor"));
        assert!(p.contains("CRITICAL"));
    }

    #[test]
    fn demo_comfy_prompt_matches_production_shape() {
        let p = build_comfy_prompt("A person at a door.");
        assert!(p.starts_with("Candid photorealistic DSLR photograph"));
        assert!(p.contains("A person at a door."));
        assert!(p.contains("aspect_ratio 1:1"));
        assert!(p.contains("image_size 1K"));
        assert!(p.contains("no watermarks"));
    }
}
