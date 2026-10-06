const browserOrigin = typeof window !== 'undefined' ? window.location.origin : '';

export const API_BASE_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? '/api' : 'http://localhost:5000/api');
export const APP_URL = import.meta.env.VITE_APP_URL || browserOrigin || 'http://localhost:5173';
export const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || '';
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
