import { TOPICS } from '../data/topics'
import { FEATURES } from '../data/features'
import { GAMES } from '../data/games'

const fallback = { topics: TOPICS, features: FEATURES, games: GAMES }

export async function fetchContent() {
  try {
    const response = await fetch('/api/content')
    if (!response.ok) return fallback
    return response.json()
  } catch {
    return fallback
  }
}
