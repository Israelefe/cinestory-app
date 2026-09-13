import axios from 'axios';
import { API_BASE_URL } from '../config/env.js';

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
  const csrf = cookieValue('veylo_csrf');
  if (csrf && !['get', 'head', 'options'].includes(String(config.method).toLowerCase())) config.headers['X-CSRF-Token'] = csrf;
  return config;
});

let refreshRequest;
api.interceptors.response.use(response => response, async error => {
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
