import { useNavigate } from 'react-router-dom'

const GAMES = [
  {
    id: 'duels',
    path: '/games/duels',
    titleEn: 'Duels',
    titleUz: 'Duellar',
    descEn: 'Answer 5 questions as fast as you can. Speed earns points.',
    descUz: "5 ta savolga imkon qadar tez javob bering. Tezlik ball keltiradi.",
  },
]

export default function Games({ language = 'en' }) {
  const navigate = useNavigate()
  const isUzbek = language === 'uz'

  return (
    <div className="app">
      <div className="page">
        <h1 className="page-title">{isUzbek ? "O'yinlar" : 'Games'}</h1>

        <div className="game-list">
          {GAMES.map((game) => (
            <button
              key={game.id}
              type="button"
              className="game-card"
              onClick={() => navigate(game.path)}
            >
              <span className="game-card-title">
                {isUzbek ? game.titleUz : game.titleEn}
              </span>
            </button>
          ))}
        </div>

        <button type="button" className="menu-btn" onClick={() => navigate('/')}>
          {isUzbek ? '\u2190 Orqaga' : '\u2190 Back'}
        </button>
      </div>
    </div>
  )
}