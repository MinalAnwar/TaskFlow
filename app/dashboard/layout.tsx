import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import Sidebar from '@/components/Sidebar'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createServerSupabase()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/auth')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', session.user.id).single()
  const isSuperAdmin = profile?.role === 'superadmin'

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar
        userEmail={session.user.email!}
        userName={session.user.user_metadata?.full_name || session.user.email!}
        isSuperAdmin={isSuperAdmin}
      />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  )
}
