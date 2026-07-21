export const STORY_ID = 1;
export const LEVEL_STORAGE_KEY = 'pronoun_practice_level';

export function resolveStoryImageUrl(url) {
  if (!url) return null;
  const normalized = url.replace('/card_images/story_arcade/', '/card_images/pronoun/');
  if (normalized.startsWith('/card_images/')) return normalized;
  const match = normalized.match(/card_images\/(.+)$/);
  if (!match) return normalized;
  return `/card_images/${match[1].replace(/\.(png|jpg|jpeg)$/i, '.avif')}`;
}

export function isPlaceholderImageUrl(url) {
  return !url || url.includes('unsplash.com');
}

export function normalizeAnswer(value) {
  return value.trim().toLowerCase().replace(/[.,!?;:]+$/, '');
}
