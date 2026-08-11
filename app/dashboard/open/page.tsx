import { createServerSupabase } from '@/lib/supabase-server'
import OpenTasksBoard from '@/components/OpenTasksBoard'

export const dynamic = 'force-dynamic'

export default async function OpenTasksPage() {
  const supabase = createServerSupabase()

  const [{ data: tasks }, { data: profiles }, { data: { session } }] = await Promise.all([
    supabase.from('tasks').select('*').is('assignee_id', null).order('created_at', { ascending: false }),
    supabase.from('profiles').select('id, email, full_name, role'),
    supabase.auth.getSession(),
  ])

  const role = profiles?.find(p => p.id === session!.user.id)?.role
  const isAdmin = role === 'admin' || role === 'superadmin'

  return (
    <OpenTasksBoard
      initialTasks={tasks || []}
      profiles={profiles || []}
      currentUserId={session!.user.id}
      isAdmin={isAdmin}
    />
  )
}
