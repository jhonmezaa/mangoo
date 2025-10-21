import axios from 'axios'
import { authService } from './auth'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

const apiClient = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
apiClient.interceptors.request.use(async (config) => {
  try {
    const token = await authService.getAccessToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  } catch (error) {
    console.error('Error getting access token:', error)
  }
  return config
})

// Handle auth errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      authService.signOut()
      window.location.href = '/login'
    }
    return Promise.reject(error)
  }
)

export const api = {
  // Users
  getCurrentUser: () => apiClient.get('/users/me'),
  registerUser: () => apiClient.post('/users/register'),

  // Bots
  listBots: (params?: { include_public?: boolean; marketplace_only?: boolean }) =>
    apiClient.get('/bots', { params }),
  getBot: (botId: string) => apiClient.get(`/bots/${botId}`),
  createBot: (data: any) => apiClient.post('/bots', data),
  updateBot: (botId: string, data: any) => apiClient.patch(`/bots/${botId}`, data),
  deleteBot: (botId: string) => apiClient.delete(`/bots/${botId}`),

  // Chat
  getChatHistory: (chatId: string) => apiClient.get(`/chat/history/${chatId}`),
  deleteChatHistory: (chatId: string) => apiClient.delete(`/chat/history/${chatId}`),

  // Knowledge
  addKnowledge: (data: any) => apiClient.post('/knowledge/add', data),
  searchKnowledge: (data: any) => apiClient.post('/knowledge/search', data),
  deleteKnowledgeBase: (kbId: string) => apiClient.delete(`/knowledge/${kbId}`),

  // Agents
  listAgents: (category?: string) =>
    apiClient.get('/agents', { params: { category } }),
  getAgent: (agentId: string) => apiClient.get(`/agents/${agentId}`),
  listCategories: () => apiClient.get('/agents/categories/list'),
}

export default apiClient
