import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Cliente da comunidade. Configurado em build via .env (RENDERER_VITE_*); null se ausente.

const url = import.meta.env.RENDERER_VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.RENDERER_VITE_SUPABASE_KEY as string | undefined

export const supabase: SupabaseClient | null =
  url && key
    ? createClient(url, key, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'devdeck-auth' }
      })
    : null

export interface CommunityProfile {
  id: string
  username: string
  display_name: string | null
  headline: string | null
  level: number
  badges: string[]
}

export interface Post {
  id: string
  author_id: string
  kind: 'article' | 'snippet'
  title: string
  body: string
  code: string | null
  language: string | null
  tags: string[]
  like_count: number
  comment_count: number
  created_at: string
  author: Pick<CommunityProfile, 'username' | 'display_name' | 'level' | 'badges'> | null
}

export interface Comment {
  id: string
  post_id: string
  author_id: string
  body: string
  created_at: string
  author: Pick<CommunityProfile, 'username' | 'level'> | null
}

export const POST_SELECT =
  'id, author_id, kind, title, body, code, language, tags, like_count, comment_count, created_at, author:profiles!posts_author_id_fkey(username, display_name, level, badges)'
