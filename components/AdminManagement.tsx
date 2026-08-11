'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/types'

function avatarText(s: string) {
  return s.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

const ROLE_STYLES = {
  superadmin: 'bg-purple-50 text-purple-700',
  admin: 'bg-blue-50 text-blue-700',
  member: 'bg-gray-100 text-gray-600',
}

export default function AdminManagement({
  initialProfiles, currentUserId
}: {
  initialProfiles: Profile[]; currentUserId: string
}) {
  const [profiles, setProfiles] = useState<Profile[]>(initialProfiles)
  const [busyId, setBusyId] = useState('')
  const [error, setError] = useState('')
  const supabase = createClient()

  async function setRole(id: string, role: 'admin' | 'member') {
    setBusyId(id); setError('')
    const { error: err } = await supabase.from('profiles').update({ role }).eq('id', id)
    setBusyId('')
    if (err) { setError(err.message); return }
    setProfiles(prev => prev.map(p => p.id === id ? { ...p, role } : p))
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-900">Manage admins</h1>
        <p className="text-sm text-gray-500 mt-0.5">Promote or demote who can assign, delete, and edit tasks.</p>
      </div>

      {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg mb-4">{error}</p>}

      <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
        {profiles.map(p => (
          <div key={p.id} className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold flex-shrink-0">
                {avatarText(p.full_name || p.email)}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">
                  {p.full_name || p.email} {p.id === currentUserId && <span className="text-gray-400">(you)</span>}
                </p>
                <p className="text-xs text-gray-400 truncate">{p.email}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 flex-shrink-0">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${ROLE_STYLES[p.role]}`}>
                {p.role}
              </span>
              {p.role === 'superadmin' ? (
                <span className="text-xs text-gray-400 w-24 text-right">Set via database</span>
              ) : p.role === 'admin' ? (
                <button
                  onClick={() => setRole(p.id, 'member')}
                  disabled={busyId === p.id}
                  className="text-xs text-gray-600 hover:text-red-600 border border-gray-200 rounded-lg px-2.5 py-1 hover:border-red-300 disabled:opacity-60 transition-colors"
                >
                  Remove admin
                </button>
              ) : (
                <button
                  onClick={() => setRole(p.id, 'admin')}
                  disabled={busyId === p.id}
                  className="text-xs text-blue-600 hover:text-blue-700 border border-blue-200 rounded-lg px-2.5 py-1 hover:border-blue-300 disabled:opacity-60 transition-colors"
                >
                  Make admin
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
