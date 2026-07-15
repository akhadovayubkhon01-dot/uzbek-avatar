import portrait from '../assets/asilbek.jpg'

export default function Avatar({ speaking, listening }) {
  const stateClass = speaking
    ? 'portrait-speaking'
    : listening
      ? 'portrait-listening'
      : 'portrait-idle'

  return (
    <div className="avatar-stage avatar-stage-center" aria-label="AI teacher avatar">
      <div className={`avatar-portrait ${stateClass}`}>
        <div className="portrait-card">
          <img src={portrait} alt="Asilbek, your AI teacher" className="portrait-img" />
        </div>

        <div className="avatar-badge">
          {speaking && <span className="status-pill speaking">Speaking</span>}
          {listening && !speaking && <span className="status-pill listening">Listening</span>}
          {!speaking && !listening && <span className="status-pill idle">Ready</span>}
        </div>
      </div>
    </div>
  )
}
