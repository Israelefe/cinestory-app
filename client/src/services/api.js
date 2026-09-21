import axios from 'axios';
import { API_BASE_URL } from '../config/env.js';
import { trackApiRequest } from './analytics.js';

function cookieValue(name) {
  return document.cookie.split('; ').find(item => item.startsWith(`${name}=`))?.split('=').slice(1).join('=') || '';
}

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  withCredentials: true,
  headers: { 'X-Requested-With': 'XMLHttpRequest' }
});

api.interceptors.request.use(config => {
  config.metadata = { startedAt: typeof performance !== 'undefined' ? performance.now() : Date.now() };
  const csrf = cookieValue('veylo_csrf');
  if (csrf && !['get', 'head', 'options'].includes(String(config.method).toLowerCase())) config.headers['X-CSRF-Token'] = csrf;
  return config;
});

let refreshRequest;
api.interceptors.response.use(response => {
  trackApiRequest({ path: response.config?.url, status: response.status, durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - Number(response.config?.metadata?.startedAt || 0) });
  return response;
}, async error => {
  trackApiRequest({ path: error.config?.url, status: error.response?.status, durationMs: (typeof performance !== 'undefined' ? performance.now() : Date.now()) - Number(error.config?.metadata?.startedAt || 0), failed: true, errorCode: error.response?.data?.code || (error.code ? String(error.code).slice(0, 80) : 'REQUEST_FAILED') });
  const original = error.config;
  const path = String(original?.url || '');
  const canRefresh = error.response?.status === 401 && original && !original._retried && !path.includes('/auth/login') && !path.includes('/auth/google') && !path.includes('/auth/refresh');
  if (!canRefresh) throw error;
  original._retried = true;
  refreshRequest ||= axios.post(`${API_BASE_URL}/v1/auth/refresh`, {}, { withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } }).finally(() => { refreshRequest = null; });
  await refreshRequest;
  return api(original);
});

export function apiMessage(error, fallback = 'Something went wrong. Please try again.') {
  return error?.response?.data?.message || fallback;
}

export default api;
