import { Router } from 'express'

const router = Router()

router.get('/', (_req, res) => {
  res.json({
    ok: true,
    ai: Boolean(process.env.GEMINI_API_KEY),
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  })
})

export default router
