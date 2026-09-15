import { supabase } from './supabase'

// Create a new conversation for the logged-in user.
export async function createConversation(userId, title = 'New chat') {
  const { data, error } = await supabase
    .from('conversations')
    .insert({ user_id: userId, title })
    .select()
    .single()

  if (error) throw error
  return data
}

// List the user's conversations, newest first.
export async function listConversations() {
  const { data, error } = await supabase
    .from('conversations')
    .select('id, title, created_at')
    .order('created_at', { ascending: false })

  if (error) throw error
  return data ?? []
}

// Load all messages in one conversation, oldest first.
export async function loadMessages(conversationId) {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  if (error) throw error
  return data ?? []
}

// Save a single message to a conversation.
export async function saveMessage(conversationId, role, content) {
  const { error } = await supabase
    .from('messages')
    .insert({ conversation_id: conversationId, role, content })

  if (error) throw error
}

// Rename a conversation (used to set a title from the first question).
export async function renameConversation(conversationId, title) {
  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', conversationId)

  if (error) throw error
}

// Delete a conversation and its messages.
export async function deleteConversation(conversationId) {
  const { error } = await supabase
    .from('conversations')
    .delete()
    .eq('id', conversationId)

  if (error) throw error
}