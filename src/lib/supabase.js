import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// A password-reset email links back to the app with details in the URL hash
// (#...&type=recovery, or #error_description=... when the link has expired).
// Read them before the client starts, because the client removes them from the
// address bar once it has processed them.
const hashParams = new URLSearchParams(
  typeof window !== 'undefined' ? window.location.hash.replace(/^#/, '') : '',
)
export const recoveryLinkInUrl = hashParams.get('type') === 'recovery'
export const authLinkError = hashParams.get('error_description')

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
