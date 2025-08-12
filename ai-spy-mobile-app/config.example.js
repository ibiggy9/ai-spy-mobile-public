// Example Configuration for AI-SPY Mobile App
// Copy to config.js and replace with actual configuration

const config = {
  // API Configuration
  API_BASE_URL: 'https://your-api-domain.com', // Replace with your actual API domain

  // App Configuration
  APP_NAME: 'AI-SPY',
  APP_VERSION: '1.0.0',

  // Feature Flags
  ENABLE_CHAT: true,
  ENABLE_SUBSCRIPTION: true,
  ENABLE_ANALYTICS: false,

  // Development Settings
  DEBUG_MODE: __DEV__,
  LOG_LEVEL: __DEV__ ? 'debug' : 'error',
};

export default config;
