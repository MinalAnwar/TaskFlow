import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'

export default async function Home() {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (session) redirect('/dashboard')
  else redirect('/auth')
}
