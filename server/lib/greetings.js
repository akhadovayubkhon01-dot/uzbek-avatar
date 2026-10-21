// Short replies to messages that are only a greeting ("salom", "hello",
// "assalomu alaykum, qalaysiz?"). These are answered here without calling
// Gemini: the reply stays short, and greetings don't use up the daily quota.
// Anything more than a greeting ("Salom, Amir Temur kim?") goes to the model
// as usual.

const PHRASES = [
  // Uzbek greetings (longest first, so "assalomu alaykum" wins over "assalom")
  { text: 'assalomu alaykum', lang: 'uz', kind: 'salaam' },
  { text: 'assalomu aleykum', lang: 'uz', kind: 'salaam' },
  { text: 'assalom alaykum', lang: 'uz', kind: 'salaam' },
  { text: 'assalom aleykum', lang: 'uz', kind: 'salaam' },
  { text: 'salom alaykum', lang: 'uz', kind: 'salaam' },
  { text: 'assalomu', lang: 'uz', kind: 'salaam' },
  { text: 'assalom', lang: 'uz', kind: 'salaam' },
  { text: 'xayrli tong', lang: 'uz', kind: 'morning' },
  { text: 'hayrli tong', lang: 'uz', kind: 'morning' },
  { text: 'xayrli kun', lang: 'uz', kind: 'day' },
  { text: 'hayrli kun', lang: 'uz', kind: 'day' },
  { text: 'xayrli kech', lang: 'uz', kind: 'evening' },
  { text: 'hayrli kech', lang: 'uz', kind: 'evening' },
  { text: 'salomlar', lang: 'uz', kind: 'hello' },
  { text: 'salom', lang: 'uz', kind: 'hello' },
  { text: 'salam', lang: 'uz', kind: 'hello' },
  // Uzbek "how are you"
  { text: 'ishlar qalay', lang: 'uz', kind: 'howareyou' },
  { text: 'yaxshimisiz', lang: 'uz', kind: 'howareyou' },
  { text: 'yaxshimisan', lang: 'uz', kind: 'howareyou' },
  { text: 'qalaysiz', lang: 'uz', kind: 'howareyou' },
  { text: 'qalesiz', lang: 'uz', kind: 'howareyou' },
  { text: 'qandaysiz', lang: 'uz', kind: 'howareyou' },
  { text: 'qalaysan', lang: 'uz', kind: 'howareyou' },
  // English greetings
  { text: 'good morning', lang: 'en', kind: 'morning' },
  { text: 'good afternoon', lang: 'en', kind: 'day' },
  { text: 'good evening', lang: 'en', kind: 'evening' },
  { text: 'hello there', lang: 'en', kind: 'hello' },
  { text: 'hi there', lang: 'en', kind: 'hello' },
  { text: 'hey there', lang: 'en', kind: 'hello' },
  { text: 'greetings', lang: 'en', kind: 'hello' },
  { text: 'hello', lang: 'en', kind: 'hello' },
  { text: 'howdy', lang: 'en', kind: 'hello' },
  { text: 'hiya', lang: 'en', kind: 'hello' },
  { text: 'hey', lang: 'en', kind: 'hello' },
  { text: 'hi', lang: 'en', kind: 'hello' },
  // English "how are you"
  { text: 'how are you doing', lang: 'en', kind: 'howareyou' },
  { text: 'how are you', lang: 'en', kind: 'howareyou' },
  { text: 'hows it going', lang: 'en', kind: 'howareyou' },
  { text: 'how is it going', lang: 'en', kind: 'howareyou' },
  { text: 'whats up', lang: 'en', kind: 'howareyou' },
]

// Words that can accompany a greeting without changing it ("Salom ustoz").
const FILLERS = ['aka', 'ustoz', 'domla', 'opa', 'dear', 'teacher', 'va', 'and', 'there']

function clean(text) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/[ʻʼ‘’`´']/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Returns { lang, kinds } when the message is only a greeting, otherwise null.
export function detectGreeting(message, teacherName = '') {
  let rest = clean(message ?? '')
  if (!rest || rest.length > 60) return null

  const nameWords = clean(teacherName).split(' ').filter(Boolean)
  const skip = new Set([...FILLERS, ...nameWords])

  const found = []
  while (rest) {
    const word = rest.split(' ')[0]
    if (skip.has(word)) {
      rest = rest.slice(word.length).trim()
      continue
    }
    const phrase = PHRASES.find((p) => rest === p.text || rest.startsWith(`${p.text} `))
    if (!phrase) return null
    found.push(phrase)
    rest = rest.slice(phrase.text.length).trim()
  }
  if (!found.length) return null

  const uz = found.filter((p) => p.lang === 'uz').length
  const lang = uz >= found.length - uz ? 'uz' : 'en'
  return { lang, kinds: new Set(found.map((p) => p.kind)) }
}

export function greetingReply({ lang, kinds }) {
  if (lang === 'uz') {
    const opening = kinds.has('salaam')
      ? 'Va alaykum assalom!'
      : kinds.has('morning')
        ? 'Xayrli tong!'
        : kinds.has('evening')
          ? 'Xayrli kech!'
          : kinds.has('day')
            ? 'Xayrli kun!'
            : 'Salom!'
    const wellbeing = kinds.has('howareyou') ? ' Yaxshi, rahmat.' : ''
    return `${opening}${wellbeing} Sizga qanday yordam bera olaman?`
  }

  const opening = kinds.has('morning')
    ? 'Good morning!'
    : kinds.has('evening')
      ? 'Good evening!'
      : kinds.has('day')
        ? 'Good afternoon!'
        : 'Hello!'
  const wellbeing = kinds.has('howareyou') ? " I'm well, thank you." : ''
  return `${opening}${wellbeing} How can I help you?`
}
