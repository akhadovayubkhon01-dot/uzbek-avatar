import { useNavigate } from 'react-router-dom'

export default function Games({ language = 'en' }) {
  const navigate = useNavigate()
  const isUzbek = language === 'uz'

  return (
    <div className="app">
      <div className="page">
        <h1 className="page-title">{isUzbek ? "O'yinlar" : 'Games'}</h1>
        <p className="page-hint">{isUzbek ? 'Tez orada...' : 'Coming soon...'}</p>

        <button type="button" className="menu-btn" onClick={() => navigate('/')}>
          {isUzbek ? '\u2190 Orqaga' : '\u2190 Back'}
        </button>
      </div>
    </div>
  )
}
