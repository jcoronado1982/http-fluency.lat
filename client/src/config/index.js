// src/config/index.js

const config = {
  development: {
    apiUrl: import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : "",
    features: {
      mockImageGen: false,
      aiEnabled: true,
      flashcards: import.meta.env.VITE_ENABLE_FLASHCARDS !== 'false',
      auth: import.meta.env.VITE_ENABLE_AUTH !== 'false',
      storyArcade: import.meta.env.VITE_ENABLE_STORY_ARCADE !== 'false',
      payments: import.meta.env.VITE_ENABLE_PAYMENTS === 'true',
      subscriptions: import.meta.env.VITE_ENABLE_SUBSCRIPTIONS === 'true',
    }
  },
  production: {
    apiUrl: import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : "",
    features: {
      mockImageGen: false,
      aiEnabled: true,
      flashcards: import.meta.env.VITE_ENABLE_FLASHCARDS !== 'false',
      auth: import.meta.env.VITE_ENABLE_AUTH !== 'false',
      storyArcade: import.meta.env.VITE_ENABLE_STORY_ARCADE !== 'false',
      payments: import.meta.env.VITE_ENABLE_PAYMENTS === 'true',
      subscriptions: import.meta.env.VITE_ENABLE_SUBSCRIPTIONS === 'true',
    }
  }
};

const env = import.meta.env.MODE || 'development';
export default config[env];

