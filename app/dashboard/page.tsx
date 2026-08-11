import { createServerSupabase } from '@/lib/supabase-server'
import KanbanBoard from '@/components/KanbanBoard'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = createServerSupabase()

  const [{ data: tasks }, { data: profiles }, { data: { session } }] = await Promise.all([
    supabase.from('tasks').select('*').order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, email, full_name, role'),
    supabase.auth.getSession(),
  ])

  const isAdmin = profiles?.find(p => p.id === session!.user.id)?.role === 'admin'

  return (
    <KanbanBoard
      initialTasks={tasks || []}
      profiles={profiles || []}
      currentUserId={session!.user.id}
      isAdmin={isAdmin}
    />
  )
}
