import { Router } from 'express'
import { handleChat } from '../chat.js'

const router = Router()

router.post('/', async (req, res) => {
  try {
    const { messages, language, topicId } = req.body ?? {}

    if (!Array.isArray(messages)) {
      res.status(400).json({ error: 'messages must be an array' })
      return
    }

    const result = await handleChat(messages, language, topicId)
    res.json(result)
  } catch (err) {
    res.status(500).json({ error: err.message || 'Chat request failed' })
  }
})

export default router
