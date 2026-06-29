use mod_flashcards::audio_use_cases::AudioSynthRequest;
use mod_flashcards::image_use_cases::{ImageGenRequest, UploadImageRequest};

use crate::api::dto::generation::{DeleteAudioBody, GenerateImageBody, SynthesizeSpeechBody};

pub fn to_audio_synth_request(body: SynthesizeSpeechBody) -> AudioSynthRequest {
    AudioSynthRequest {
        category: body.category,
        deck: body.deck,
        text: body.text,
        voice_name: body.voice_name,
        verb_name: body.verb_name.filter(|s| !s.is_empty()),
        tone: body.tone.filter(|s| !s.is_empty()),
        lang: body.lang.filter(|s| !s.is_empty()),
        exclude_voice: body.exclude_voice.filter(|s| !s.is_empty()),
        force_regenerate: body.force_regenerate.unwrap_or(false),
    }
}

pub fn to_delete_audio_request(body: DeleteAudioBody) -> AudioSynthRequest {
    AudioSynthRequest {
        category: body.category,
        deck: body.deck,
        text: body.text,
        voice_name: body.voice_name,
        verb_name: body.verb_name.filter(|s| !s.is_empty()),
        tone: body.tone.filter(|s| !s.is_empty()),
        lang: body.lang.filter(|s| !s.is_empty()),
        exclude_voice: body.exclude_voice.filter(|s| !s.is_empty()),
        force_regenerate: false,
    }
}

pub fn to_image_gen_request(body: GenerateImageBody) -> ImageGenRequest {
    ImageGenRequest {
        category: body.category,
        deck: body.deck,
        index: body.index,
        def_index: body.def_index,
        prompt: body.prompt,
        meaning: body.meaning,
        usage_example: body.usage_example,
        force_generation: body.force_generation,
        form: body.form,
        scene_complement: body.scene_complement.filter(|s| !s.trim().is_empty()),
    }
}

pub fn to_upload_image_request(
    category: String,
    deck: String,
    card_index: usize,
    def_index: usize,
    form: Option<String>,
    file_data: Vec<u8>,
    file_name: String,
    content_type: String,
) -> UploadImageRequest {
    UploadImageRequest {
        category,
        deck,
        card_index,
        def_index,
        form,
        file_data,
        file_name,
        content_type,
    }
}
