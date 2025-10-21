import { useEffect, useState } from 'react'
import { api } from '../services/api'
import { Package } from 'lucide-react'

export default function Marketplace() {
  const [agents, setAgents] = useState<any[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [selectedCategory])

  const loadData = async () => {
    try {
      const [agentsRes, categoriesRes] = await Promise.all([
        api.listAgents(selectedCategory || undefined),
        api.listCategories(),
      ])
      setAgents(agentsRes.data)
      setCategories(categoriesRes.data.categories)
    } catch (error) {
      console.error('Error loading marketplace:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Agent Marketplace</h1>

        <div className="flex gap-2 mb-6 overflow-x-auto">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-4 py-2 rounded-lg whitespace-nowrap ${
              selectedCategory === null
                ? 'bg-primary-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300'
            }`}
          >
            All
          </button>
          {categories.map((category) => (
            <button
              key={category}
              onClick={() => setSelectedCategory(category)}
              className={`px-4 py-2 rounded-lg whitespace-nowrap ${
                selectedCategory === category
                  ? 'bg-primary-600 text-white'
                  : 'bg-white text-gray-700 border border-gray-300'
              }`}
            >
              {category}
            </button>
          ))}
        </div>

        {loading ? (
          <p className="text-gray-600">Loading agents...</p>
        ) : agents.length === 0 ? (
          <div className="text-center py-12">
            <Package size={48} className="mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No agents available in this category</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-start gap-4">
                  {agent.icon_url ? (
                    <img
                      src={agent.icon_url}
                      alt={agent.display_name}
                      className="w-12 h-12 rounded-lg"
                    />
                  ) : (
                    <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
                      <Package className="text-primary-600" size={24} />
                    </div>
                  )}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">
                      {agent.display_name}
                    </h3>
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {agent.category}
                    </span>
                  </div>
                </div>
                <p className="text-sm text-gray-600 mt-4">{agent.description}</p>
                {agent.capabilities && agent.capabilities.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {agent.capabilities.slice(0, 3).map((cap: string, index: number) => (
                      <span
                        key={index}
                        className="text-xs bg-primary-50 text-primary-700 px-2 py-1 rounded"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                )}
                <button className="mt-4 w-full bg-primary-600 text-white py-2 rounded-lg hover:bg-primary-700 transition-colors">
                  Use Agent
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
