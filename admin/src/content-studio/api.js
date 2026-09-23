import axios from 'axios';
import { getAdminToken } from '../services/api.js';

// Content jobs always go to the local PC service, never to the client-facing API.
const host = typeof window !== 'undefined' && window.location.hostname === 'localhost' ? 'localhost' : '127.0.0.1';
const contentApi = axios.create({ baseURL: `http://${host}:5055/api`, withCredentials: true, timeout: 20000 });
contentApi.interceptors.request.use(config => {
  const token = getAdminToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default contentApi;
