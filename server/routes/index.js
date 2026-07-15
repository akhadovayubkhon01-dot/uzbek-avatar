import { Router } from 'express'
import healthRouter from './health.js'
import chatRouter from './chat.js'
import contentRouter from './content.js'

const router = Router()

router.use('/health', healthRouter)
router.use('/chat', chatRouter)
router.use('/content', contentRouter)

export default router
