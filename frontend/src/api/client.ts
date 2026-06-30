import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function setInitDataHeader(initData: string) {
  apiClient.defaults.headers.common['X-Telegram-Init-Data'] = initData;
}

export function setAccessToken(token: string) {
  apiClient.defaults.headers.common.Authorization = `Bearer ${token}`;
}

export function clearAccessToken() {
  delete apiClient.defaults.headers.common.Authorization;
}

export function clearInitDataHeader() {
  delete apiClient.defaults.headers.common['X-Telegram-Init-Data'];
}

