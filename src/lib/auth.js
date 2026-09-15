import { supabase } from './supabase'

// Create a new account with email + password.
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw error
  return data.user
}

// Log in to an existing account.
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user
}

// Log out the current user.
export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

// Get the currently logged-in user, or null if nobody is logged in.
export async function getCurrentUser() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

// Run a callback whenever the login state changes (login, logout, session restore).
export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}