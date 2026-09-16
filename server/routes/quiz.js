import { Router } from 'express'
import { handleQuiz } from '../quiz.js'

const router = Router()

router.post('/', async (req, res) => {
  const { categories, language } = req.body ?? {}

  try {
    const questions = await handleQuiz(categories, language)
    res.json({ questions })
  } catch (err) {
    console.error('[Quiz] failed:', err.message)
    res.status(500).json({ error: err.message })
  }
})

export default router