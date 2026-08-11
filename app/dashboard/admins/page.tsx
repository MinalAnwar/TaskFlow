import { redirect } from 'next/navigation'
import { createServerSupabase } from '@/lib/supabase-server'
import AdminManagement from '@/components/AdminManagement'

export const dynamic = 'force-dynamic'

export default async function ManageAdminsPage() {
  const supabase = createServerSupabase()

  const { data: { session } } = await supabase.auth.getSession()

  const { data: profiles } = await supabase.from('profiles').select('id, email, full_name, role').order('email')

  const isSuperAdmin = profiles?.find(p => p.id === session!.user.id)?.role === 'superadmin'
  if (!isSuperAdmin) redirect('/dashboard')

  return <AdminManagement initialProfiles={profiles || []} currentUserId={session!.user.id} />
}
