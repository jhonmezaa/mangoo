import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Plus, Edit, Trash2 } from 'lucide-react'

export default function Bots() {
  const [bots, setBots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [, setShowCreateModal] = useState(false)

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

  const deleteBot = async (botId: string) => {
    if (!confirm('Are you sure you want to delete this bot?')) return

    try {
      await api.deleteBot(botId)
      setBots((prev) => prev.filter((bot) => bot.id !== botId))
    } catch (error) {
      console.error('Error deleting bot:', error)
      alert('Failed to delete bot')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">My Bots</h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="bg-primary-600 text-white px-4 py-2 rounded-lg hover:bg-primary-700 transition-colors flex items-center gap-2"
          >
            <Plus size={20} />
            Create Bot
          </button>
        </div>

        {loading ? (
          <p className="text-gray-600">Loading...</p>
        ) : bots.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">You haven't created any bots yet</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700 transition-colors"
            >
              Create Your First Bot
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex justify-between items-start mb-4">
                  <h3 className="font-semibold text-gray-900 text-lg">{bot.name}</h3>
                  <div className="flex gap-2">
                    <button className="text-gray-600 hover:text-primary-600">
                      <Edit size={18} />
                    </button>
                    <button
                      onClick={() => deleteBot(bot.id)}
                      className="text-gray-600 hover:text-red-600"
                    >
                      <Trash2 size={18} />
                    </button>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mb-4 line-clamp-3">
                  {bot.description || 'No description'}
                </p>
                <div className="space-y-2 text-xs text-gray-500">
                  <p>Model: {bot.model_id}</p>
                  <p>Temperature: {bot.temperature}%</p>
                  {bot.rag_enabled && (
                    <span className="inline-block bg-green-100 text-green-800 px-2 py-1 rounded">
                      RAG Enabled
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
