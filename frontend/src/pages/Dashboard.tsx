import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../services/api'
import { MessageSquare, Bot, Package, LogOut } from 'lucide-react'
import { useAuthStore } from '../stores/authStore'

export default function Dashboard() {
  const [bots, setBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const { signOut } = useAuthStore()

  useEffect(() => {
    loadBots()
  }, [])

  const loadBots = async () => {
    try {
      const response = await api.listBots({ include_public: false })
      setBots(response.data)
    } catch (error) {
      console.error('Error loading bots:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Mangoo AI</h1>
          <div className="flex gap-4">
            <Link
              to="/marketplace"
              className="text-gray-700 hover:text-primary-600 transition-colors"
            >
              Marketplace
            </Link>
            <Link
              to="/bots"
              className="text-gray-700 hover:text-primary-600 transition-colors"
            >
              My Bots
            </Link>
            <button
              onClick={signOut}
              className="text-gray-700 hover:text-red-600 transition-colors flex items-center gap-2"
            >
              <LogOut size={18} />
              Sign Out
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Link
            to="/chat"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <MessageSquare className="text-primary-600 mb-4" size={32} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">New Chat</h2>
            <p className="text-gray-600">Start a conversation with an AI assistant</p>
          </Link>

          <Link
            to="/bots"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <Bot className="text-primary-600 mb-4" size={32} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">My Bots</h2>
            <p className="text-gray-600">Manage your custom AI assistants</p>
          </Link>

          <Link
            to="/marketplace"
            className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
          >
            <Package className="text-primary-600 mb-4" size={32} />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Marketplace</h2>
            <p className="text-gray-600">Explore specialized AI agents</p>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900">Your Bots</h2>
          </div>
          <div className="p-6">
            {loading ? (
              <p className="text-gray-600">Loading...</p>
            ) : bots.length === 0 ? (
              <p className="text-gray-600">
                No bots yet.{' '}
                <Link to="/bots" className="text-primary-600 hover:underline">
                  Create your first bot
                </Link>
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {bots.map((bot) => (
                  <Link
                    key={bot.id}
                    to={`/chat/${bot.id}`}
                    className="border border-gray-200 rounded-lg p-4 hover:border-primary-500 transition-colors"
                  >
                    <h3 className="font-semibold text-gray-900 mb-2">{bot.name}</h3>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {bot.description || 'No description'}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
