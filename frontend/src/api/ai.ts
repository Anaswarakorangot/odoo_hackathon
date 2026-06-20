import axios from 'axios';

const API_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const aiApi = {
  getDemandForecast: async () => {
    const response = await api.get('/ai/demand-forecast');
    return response.data;
  },
  getAnomalies: async () => {
    const response = await api.get('/ai/anomalies');
    return response.data;
  },
};
