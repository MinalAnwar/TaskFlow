'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { TaskActivity, Profile } from '@/lib/types'

const STATUS_LABELS: Record<string, string> = { todo: 'To do', inprogress: 'In progress', done: 'Done' }
const PRIORITY_LABELS: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High' }

function describe(a: TaskActivity, profiles: Profile[]) {
  const name = (id: string | null) => {
    if (!id) return 'Unassigned'
    const p = profiles.find(p => p.id === id)
    return p ? (p.full_name || p.email) : 'Someone'
  }
  const actor = name(a.actor_id)

  switch (a.action) {
    case 'created':
      return `${actor} created this task`
    case 'assigned':
      return a.detail.from_id
        ? `${actor} reassigned this task from ${name(a.detail.from_id)} to ${name(a.detail.to_id)}`
        : `${actor} assigned this task to ${name(a.detail.to_id)}`
    case 'unassigned':
      return `${actor} unassigned this task (was ${name(a.detail.from_id)})`
    case 'status_changed':
      return `${actor} moved this task from ${STATUS_LABELS[a.detail.from || ''] || a.detail.from} to ${STATUS_LABELS[a.detail.to || ''] || a.detail.to}`
    case 'priority_changed':
      return `${actor} changed priority from ${PRIORITY_LABELS[a.detail.from || ''] || a.detail.from} to ${PRIORITY_LABELS[a.detail.to || ''] || a.detail.to}`
    case 'title_changed':
      return `${actor} renamed this task to "${a.detail.to}"`
    default:
      return `${actor} updated this task`
  }
}

export default function TaskActivityLog({ taskId, profiles }: { taskId: string; profiles: Profile[] }) {
  const [activity, setActivity] = useState<TaskActivity[]>([])
  const supabase = createClient()

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('task_activity').select('*').eq('task_id', taskId).order('created_at', { ascending: false })
    if (data) setActivity(data)
  }, [supabase, taskId])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const channel = supabase
      .channel(`task-activity-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_activity', filter: `task_id=eq.${taskId}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, taskId, refresh])

  // activity is newest-first, so the first 'assigned' entry is the current assignment.
  const lastAssigned = activity.find(a => a.action === 'assigned')
  const assignedBy = lastAssigned
    ? profiles.find(p => p.id === lastAssigned.actor_id)
    : undefined

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Activity</h3>

      {lastAssigned && (
        <p className="text-xs text-gray-600 bg-blue-50 px-3 py-2 rounded-lg mb-2">
          Assigned by <span className="font-medium">{assignedBy?.full_name || assignedBy?.email || 'someone'}</span>
          {' · '}{new Date(lastAssigned.created_at).toLocaleString()}
        </p>
      )}

      {activity.length === 0 ? (
        <p className="text-xs text-gray-400">
          No history recorded for this task yet. Activity is tracked from the point logging
          was enabled, so older changes don&apos;t appear here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {activity.map(a => (
            <li key={a.id} className="text-xs text-gray-500">
              <span className="text-gray-400 font-mono mr-1.5">{new Date(a.created_at).toLocaleString()}</span>
              {describe(a, profiles)}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
