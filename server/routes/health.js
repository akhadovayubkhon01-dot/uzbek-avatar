import { Router } from 'express'
import { getChunkCount } from '../lib/knowledge.js'

const router = Router()

router.get('/', async (_req, res) => {
  const chunks = await getChunkCount()
  res.json({
    ok: true,
    ai: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-3.5-flash',
    chunks,
  })
})

export default router
