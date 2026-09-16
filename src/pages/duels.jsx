import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'

const TIME_LIMIT = 60
const BASE_POINTS = 100
const SPEED_BONUS = 100

const CATEGORIES = [
  { id: 'history', labelEn: 'History', labelUz: 'Tarix' },
  { id: 'facts', labelEn: 'Facts', labelUz: 'Faktlar' },
]

export default function Duels({ language = 'en' }) {
  const navigate = useNavigate()
  const isUz = language === 'uz'

  const [phase, setPhase] = useState('setup')
  const [selected, setSelected] = useState(['history'])
  const [questions, setQuestions] = useState([])
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [results, setResults] = useState([])
  const [timeLeft, setTimeLeft] = useState(TIME_LIMIT)
  const [chosen, setChosen] = useState(null)
  const [error, setError] = useState('')

  const timerRef = useRef(null)

  const toggleCategory = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    )
  }

  const startGame = async () => {
    if (!selected.length) {
      setError(isUz ? 'Kamida bitta mavzu tanlang.' : 'Pick at least one category.')
      return
    }

    setError('')
    setPhase('loading')

    try {
      const res = await fetch('/api/quiz', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: selected, language }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not load questions')

      setQuestions(data.questions)
      setIndex(0)
      setScore(0)
      setResults([])
      setChosen(null)
      setTimeLeft(TIME_LIMIT)
      setPhase('playing')
    } catch (err) {
      setError(err.message)
      setPhase('setup')
    }
  }

  const finishQuestion = useCallback(
    (pickedIndex, remaining) => {
      const question = questions[index]
      const correct = pickedIndex === question.correctIndex
      const points = correct
        ? BASE_POINTS + Math.round((remaining / TIME_LIMIT) * SPEED_BONUS)
        : 0

      setScore((prev) => prev + points)
      setResults((prev) => [
        ...prev,
        { question: question.question, correct, points, picked: pickedIndex },
      ])
      setChosen(pickedIndex)

      setTimeout(() => {
        if (index + 1 >= questions.length) {
          setPhase('results')
        } else {
          setIndex((prev) => prev + 1)
          setChosen(null)
          setTimeLeft(TIME_LIMIT)
        }
      }, 1200)
    },
    [questions, index],
  )

  useEffect(() => {
    if (phase !== 'playing' || chosen !== null) return

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current)
          finishQuestion(-1, 0)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [phase, index, chosen, finishQuestion])

  const pickAnswer = (optionIndex) => {
    if (chosen !== null) return
    clearInterval(timerRef.current)
    finishQuestion(optionIndex, timeLeft)
  }

  if (phase === 'setup') {
    return (
      <div className="app">
        <div className="page">
          <h1 className="page-title">{isUz ? 'Duellar' : 'Duels'}</h1>
          <p className="page-hint">
            {isUz
              ? '5 ta savol. Har biriga 1 daqiqa. Tez javob bering — ko\'proq ball olasiz.'
              : '5 questions. One minute each. Answer fast to score higher.'}
          </p>

          <div className="duel-categories">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`duel-category ${selected.includes(cat.id) ? 'selected' : ''}`}
                onClick={() => toggleCategory(cat.id)}
              >
                {isUz ? cat.labelUz : cat.labelEn}
              </button>
            ))}
          </div>

          {error && <p className="auth-error">{error}</p>}

          <button type="button" className="auth-submit" onClick={startGame}>
            {isUz ? 'Boshlash' : 'Start'}
          </button>

          <button type="button" className="menu-btn" onClick={() => navigate('/games')}>
            {isUz ? '\u2190 Orqaga' : '\u2190 Back'}
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'loading') {
    return (
      <div className="app">
        <div className="page">
          <h1 className="page-title">{isUz ? 'Duellar' : 'Duels'}</h1>
          <p className="page-hint">
            {isUz ? 'Savollar tayyorlanmoqda...' : 'Preparing questions...'}
          </p>
        </div>
      </div>
    )
  }

  if (phase === 'playing') {
    const question = questions[index]

    return (
      <div className="app">
        <div className="page">
          <div className="duel-header">
            <span>
              {isUz ? 'Savol' : 'Question'} {index + 1}/{questions.length}
            </span>
            <span className={timeLeft <= 10 ? 'duel-timer urgent' : 'duel-timer'}>
              {timeLeft}s
            </span>
            <span>
              {isUz ? 'Ball' : 'Score'}: {score}
            </span>
          </div>

          <p className="duel-question">{question.question}</p>

          <div className="duel-options">
            {question.options.map((option, i) => {
              let cls = 'duel-option'
              if (chosen !== null) {
                if (i === question.correctIndex) cls += ' correct'
                else if (i === chosen) cls += ' wrong'
              }
              return (
                <button
                  key={i}
                  type="button"
                  className={cls}
                  onClick={() => pickAnswer(i)}
                  disabled={chosen !== null}
                >
                  {option}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  const correctCount = results.filter((r) => r.correct).length

  return (
    <div className="app">
      <div className="page">
        <h1 className="page-title">{isUz ? 'Natija' : 'Results'}</h1>

        <p className="duel-final-score">{score}</p>
        <p className="page-hint">
          {isUz
            ? `${correctCount}/${results.length} to'g'ri javob`
            : `${correctCount}/${results.length} correct`}
        </p>

        <div className="duel-summary">
          {results.map((r, i) => (
            <div key={i} className={`duel-summary-row ${r.correct ? 'correct' : 'wrong'}`}>
              <span>{r.question}</span>
              <span>{r.points}</span>
            </div>
          ))}
        </div>

        <button type="button" className="auth-submit" onClick={() => setPhase('setup')}>
          {isUz ? 'Yana o\'ynash' : 'Play again'}
        </button>

        <button type="button" className="menu-btn" onClick={() => navigate('/games')}>
          {isUz ? '\u2190 Orqaga' : '\u2190 Back'}
        </button>
      </div>
    </div>
  )
}