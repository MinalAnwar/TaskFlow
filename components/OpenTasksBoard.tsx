'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, Profile } from '@/lib/types'
import TaskModal from './TaskModal'

const PRIORITY_STYLES = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-green-50 text-green-700',
}

export default function OpenTasksBoard({
  initialTasks, profiles, currentUserId, isAdmin
}: {
  initialTasks: Task[]; profiles: Profile[]; currentUserId: string; isAdmin: boolean
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const supabase = createClient()

  const refresh = useCallback(async () => {
    const { data } = await supabase
      .from('tasks').select('*').is('assignee_id', null).order('created_at', { ascending: false })
    if (data) setTasks(data)
  }, [supabase])

  useEffect(() => {
    const channel = supabase
      .channel('tasks-realtime-open')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, refresh])

  async function assign(taskId: string, assigneeId: string) {
    const assignee = profiles.find(p => p.id === assigneeId)
    await supabase.from('tasks').update({
      assignee_id: assigneeId,
      assignee_email: assignee?.email || null,
      updated_at: new Date().toISOString(),
    }).eq('id', taskId)
    refresh()
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Open tasks</h1>
          <p className="text-sm text-gray-500 mt-0.5">{tasks.length} unassigned</p>
        </div>
        <button
          onClick={() => { setEditTask(null); setShowModal(true) }}
          className="flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New task
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center">
          <p className="text-sm text-gray-400">No open tasks — everything's assigned.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tasks.map(task => (
            <div
              key={task.id}
              className="bg-white border border-gray-200 rounded-xl p-4 cursor-pointer hover:border-gray-300 transition-colors"
              onClick={() => { setEditTask(task); setShowModal(true) }}
            >
              <p className="text-xs text-gray-400 mb-1 font-mono">{task.id.slice(0, 8).toUpperCase()}</p>
              <p className="text-sm font-medium text-gray-800 mb-1 leading-snug">{task.title}</p>
              {task.description && (
                <p className="text-xs text-gray-500 mb-3 line-clamp-2">{task.description}</p>
              )}
              <div className="flex items-center justify-between gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLES[task.priority]}`}>
                  {task.priority}
                </span>
                {isAdmin ? (
                  <select
                    value=""
                    onClick={e => e.stopPropagation()}
                    onChange={e => { if (e.target.value) assign(task.id, e.target.value) }}
                    className="border border-gray-200 rounded-lg px-2 py-1 text-xs bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 max-w-[55%]"
                  >
                    <option value="" disabled>Assign to…</option>
                    {profiles.map(p => (
                      <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-gray-400">Unassigned</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <TaskModal
          task={editTask}
          profiles={profiles}
          currentUserId={currentUserId}
          isAdmin={isAdmin}
          onClose={() => setShowModal(false)}
          onSave={refresh}
        />
      )}
    </div>
  )
}
