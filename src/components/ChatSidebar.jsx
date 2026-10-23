// Left-hand chat history for signed-in users: a "New chat" button and past
// conversations grouped by date. On narrow screens it slides over the page.

const DAY = 24 * 60 * 60 * 1000

function groupConversations(conversations, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const groups = { today: [], week: [], older: [] }
  for (const conv of conversations) {
    const created = new Date(conv.created_at).getTime()
    if (created >= startOfToday) groups.today.push(conv)
    else if (created >= startOfToday - 6 * DAY) groups.week.push(conv)
    else groups.older.push(conv)
  }
  return groups
}

const LABELS = {
  en: { title: 'Chat history', newChat: 'New chat', today: 'Today', week: 'Previous 7 days', older: 'Older', empty: 'No conversations yet. Your chats will appear here.', close: 'Close chat history' },
  uz: { title: 'Suhbatlar tarixi', newChat: 'Yangi suhbat', today: 'Bugun', week: 'Oxirgi 7 kun', older: 'Avvalroq', empty: "Hozircha suhbatlar yo'q. Suhbatlaringiz shu yerda ko'rinadi.", close: 'Suhbatlar tarixini yopish' },
}

export default function ChatSidebar({ language, conversations, conversationId, onSelect, onNewChat, onClose }) {
  const t = LABELS[language === 'uz' ? 'uz' : 'en']
  const groups = groupConversations(conversations)

  return (
    <aside className="chat-sidebar" aria-label={t.title}>
      <div className="sidebar-header">
        <h2 className="sidebar-title">{t.title}</h2>
        <button type="button" className="sidebar-close" onClick={onClose} aria-label={t.close} title={t.close}>
          ✕
        </button>
      </div>

      <button type="button" className="sidebar-new-chat" onClick={onNewChat}>
        <span aria-hidden="true">＋</span> {t.newChat}
      </button>

      <div className="sidebar-list">
        {conversations.length === 0 ? (
          <p className="sidebar-empty">{t.empty}</p>
        ) : (
          ['today', 'week', 'older'].map(
            (key) =>
              groups[key].length > 0 && (
                <section key={key} className="sidebar-group">
                  <h3 className="sidebar-group-label">{t[key]}</h3>
                  {groups[key].map((conv) => (
                    <button
                      key={conv.id}
                      type="button"
                      className={`sidebar-item ${conv.id === conversationId ? 'active' : ''}`}
                      onClick={() => onSelect(conv.id)}
                      title={conv.title}
                      aria-current={conv.id === conversationId ? 'true' : undefined}
                    >
                      {conv.title}
                    </button>
                  ))}
                </section>
              ),
          )
        )}
      </div>
    </aside>
  )
}
