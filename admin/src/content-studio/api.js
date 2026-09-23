import axios from 'axios';
import { API_BASE_URL, getAdminToken } from '../services/api.js';

const contentApi = axios.create({ baseURL: API_BASE_URL, withCredentials: true, timeout: 60000 });
contentApi.interceptors.request.use(config => {
  const token = getAdminToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
export default contentApi;
