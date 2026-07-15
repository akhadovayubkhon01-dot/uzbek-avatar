import { Router } from 'express'
import { TOPICS } from '../../src/data/topics.js'
import { FEATURES } from '../../src/data/features.js'
import { GAMES } from '../../src/data/games.js'

const router = Router()

router.get('/', (_req, res) => {
  res.json({ topics: TOPICS, features: FEATURES, games: GAMES })
})

router.get('/topics', (_req, res) => {
  res.json(TOPICS)
})

router.get('/features', (_req, res) => {
  res.json(FEATURES)
})

router.get('/games', (_req, res) => {
  res.json(GAMES)
})

export default router
