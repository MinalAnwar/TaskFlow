import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
  const isSuperAdmin = profile?.role === 'superadmin'

  const { count: unreadMentions } = await supabase
    .from('comment_mentions')
    .select('id', { count: 'exact', head: true })
    .eq('mentioned_id', session.user.id)
    .is('read_at', null)

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        userEmail={session.user.email!}
        userName={session.user.user_metadata?.full_name || session.user.email!}
        currentUserId={session.user.id}
        isSuperAdmin={isSuperAdmin}
        initialUnreadMentions={unreadMentions || 0}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
