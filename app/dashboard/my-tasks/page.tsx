import { createServerSupabase } from '@/lib/supabase-server'
import KanbanBoard from '@/components/KanbanBoard'

export const dynamic = 'force-dynamic'

export default async function MyTasksPage() {
  const supabase = createServerSupabase()

  const { data: { session } } = await supabase.auth.getSession()

  const [{ data: tasks }, { data: profiles }] = await Promise.all([
    supabase.from('tasks').select('*').eq('assignee_id', session!.user.id).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, email, full_name, role'),
  ])

  const role = profiles?.find(p => p.id === session!.user.id)?.role
  const isAdmin = role === 'admin' || role === 'superadmin'

  return (
    <KanbanBoard
      initialTasks={tasks || []}
      profiles={profiles || []}
      currentUserId={session!.user.id}
      scope="mine"
      isAdmin={isAdmin}
    />
  )
}
