import { TOPICS } from '../data/topics'

export default function TopicPicker({ language, onSelect, disabled, variant = 'grid' }) {
  const isHorizontal = variant === 'horizontal'

  return (
    <div className={`topic-picker ${isHorizontal ? 'topic-picker-horizontal' : ''}`}>
      {!isHorizontal && (
        <h3>{language === 'uz' ? 'Mavzular' : 'Explore topics'}</h3>
      )}
      <div className={isHorizontal ? 'topic-strip' : 'topic-grid'} role="list">
        {TOPICS.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className={`topic-card ${isHorizontal ? 'topic-chip' : ''}`}
            disabled={disabled}
            onClick={() => onSelect(topic)}
            role="listitem"
          >
            <span className="topic-icon">{topic.icon}</span>
            <span className="topic-title">
              {language === 'uz' ? topic.titleUz : topic.titleEn}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
