import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export function createServerSupabase() {
  const cookieStore = cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value },
        set(name: string, value: string, options: object) {
          try { (cookieStore as any).set({ name, value, ...options }) } catch {}
        },
        remove(name: string, options: object) {
          try { (cookieStore as any).set({ name, value: '', ...options }) } catch {}
        },
      },
    }
  )
}
