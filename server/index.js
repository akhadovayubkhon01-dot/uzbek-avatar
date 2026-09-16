import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import apiRouter from './routes/index.js'

const app = express()
const PORT = process.env.PORT || 3001

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const distPath = path.resolve(__dirname, '../dist')

app.use(cors({ origin: true }))
app.use(express.json({ limit: '1mb' }))

// Backend API
app.use('/api', apiRouter)

// Unknown API routes should still return JSON, not the React app
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// Serve the production React build
app.use(express.static(distPath))

// React Router fallback:
// /games, /games/duels, etc. should all load the React app.
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'))
})

// Fallback for unsupported non-GET routes
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' })
})

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`)
  console.log(
    process.env.GEMINI_API_KEY
      ? 'AI mode: Gemini key loaded'
      : 'Demo mode: no GEMINI_API_KEY',
  )
})