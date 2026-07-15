import { useEffect, useRef } from 'react'
import { TEACHER_NAME } from '../lib/prompts'

export default function Chat({
  messages,
  input,
  onInputChange,
  onSubmit,
  onMic,
  listening,
  loading,
  language,
}) {
  const bottomRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  return (
    <div className="chat-panel">
      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="chat-empty">
            {language === 'uz'
              ? 'Savol bering yoki yuqoridagi menyudan mavzu tanlang.'
              : 'Ask a question or pick a topic from the menu above.'}
          </p>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <span className="message-role">
              {msg.role === 'user'
                ? language === 'uz'
                  ? 'Siz'
                  : 'You'
                : TEACHER_NAME}
            </span>
            <p>{msg.content}</p>
          </div>
        ))}
        {loading && (
          <div className="message message-assistant">
            <span className="message-role">{TEACHER_NAME}</span>
            <p className="typing">
              <span></span>
              <span></span>
              <span></span>
            </p>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form
        className="chat-input-row"
        onSubmit={(e) => {
          e.preventDefault()
          onSubmit()
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          placeholder={
            language === 'uz'
              ? "O'zbekiston tarixi haqida savol yozing..."
              : 'Ask about Uzbek history or culture...'
          }
          disabled={loading}
          aria-label="Message input"
        />
        <button
          type="button"
          className={`mic-btn ${listening ? 'active' : ''}`}
          onClick={onMic}
          disabled={loading}
          title={language === 'uz' ? 'Ovoz bilan gapirish' : 'Voice input'}
          aria-label="Voice input"
        >
          🎤
        </button>
        <button type="submit" className="send-btn" disabled={loading || !input.trim()}>
          {language === 'uz' ? 'Yuborish' : 'Send'}
        </button>
      </form>
    </div>
  )
}
