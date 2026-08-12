'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import type { Task, Profile } from '@/lib/types'
import TaskModal from './TaskModal'

const COLS = [
  { key: 'todo', label: 'To do', color: 'bg-gray-400' },
  { key: 'inprogress', label: 'In progress', color: 'bg-amber-400' },
  { key: 'done', label: 'Done', color: 'bg-green-500' },
] as const

const PRIORITY_STYLES = {
  high: 'bg-red-50 text-red-700',
  medium: 'bg-amber-50 text-amber-700',
  low: 'bg-green-50 text-green-700',
}

function avatarText(s: string) {
  return s.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

export default function KanbanBoard({
  initialTasks, profiles, currentUserId, scope = 'all', isAdmin
}: {
  initialTasks: Task[]; profiles: Profile[]; currentUserId: string; scope?: 'all' | 'mine'; isAdmin: boolean
}) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks)
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [filterAssignee, setFilterAssignee] = useState('')
  const [filterPriority, setFilterPriority] = useState('')
  const supabase = createClient()
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const taskId = searchParams.get('task')
    if (!taskId) return
    const match = tasks.find(t => t.id === taskId)
    if (match) {
      setEditTask(match)
      setShowModal(true)
      router.replace(scope === 'mine' ? '/dashboard/my-tasks' : '/dashboard')
    }
  }, [searchParams, tasks, router, scope])

  const refresh = useCallback(async () => {
    let query = supabase.from('tasks').select('*').order('created_at', { ascending: false })
    if (scope === 'mine') query = query.eq('assignee_id', currentUserId)
    const { data } = await query
    if (data) setTasks(data)
  }, [supabase, scope, currentUserId])

  useEffect(() => {
    const channel = supabase
      .channel(`tasks-realtime-${scope}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, refresh, scope])

  const filtered = tasks.filter(t =>
    (!filterAssignee || t.assignee_id === filterAssignee) &&
    (!filterPriority || t.priority === filterPriority)
  )

  async function moveTask(id: string, status: string) {
    await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', id)
    refresh()
  }

  async function deleteTask(id: string) {
    await supabase.from('tasks').delete().eq('id', id)
    refresh()
  }

  const stats = {
    total: tasks.length,
    todo: tasks.filter(t => t.status === 'todo').length,
    inprogress: tasks.filter(t => t.status === 'inprogress').length,
    done: tasks.filter(t => t.status === 'done').length,
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{scope === 'mine' ? 'My tasks' : 'Board'}</h1>
          <p className="text-sm text-gray-500 mt-0.5">{stats.total} tasks total</p>
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

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'Total', val: stats.total, color: 'text-blue-600' },
          { label: 'To do', val: stats.todo, color: 'text-gray-600' },
          { label: 'In progress', val: stats.inprogress, color: 'text-amber-600' },
          { label: 'Done', val: stats.done, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-gray-200 px-4 py-3">
            <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">{s.label}</p>
            <p className={`text-2xl font-semibold ${s.color}`}>{s.val}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {scope === 'all' && (
          <select
            value={filterAssignee}
            onChange={e => setFilterAssignee(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All assignees</option>
            {profiles.map(p => (
              <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
            ))}
          </select>
        )}
        <select
          value={filterPriority}
          onChange={e => setFilterPriority(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        {(filterAssignee || filterPriority) && (
          <button
            onClick={() => { setFilterAssignee(''); setFilterPriority('') }}
            className="text-sm text-gray-500 hover:text-gray-800 px-2 underline"
          >
            Clear
          </button>
        )}
      </div>

      {/* Kanban columns */}
      <div className="grid grid-cols-3 gap-4">
        {COLS.map(col => {
          const colTasks = filtered.filter(t => t.status === col.key)
          return (
            <div key={col.key} className="bg-white rounded-xl border border-gray-200 p-3">
              <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-100">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.color}`} />
                  <span className="text-sm font-medium text-gray-700">{col.label}</span>
                </div>
                <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">{colTasks.length}</span>
              </div>
              <div className="space-y-2 min-h-[40px]">
                {colTasks.length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-6">No tasks</p>
                )}
                {colTasks.map(task => {
                  const assignee = profiles.find(p => p.id === task.assignee_id)
                  return (
                    <div
                      key={task.id}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3 cursor-pointer hover:border-gray-300 transition-colors group"
                      onClick={() => { setEditTask(task); setShowModal(true) }}
                    >
                      <p className="text-xs text-gray-400 mb-1 font-mono">
                        {task.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="text-sm font-medium text-gray-800 mb-1 leading-snug">{task.title}</p>
                      {task.description && (
                        <p className="text-xs text-gray-500 mb-2 line-clamp-2">{task.description}</p>
                      )}
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full capitalize ${PRIORITY_STYLES[task.priority]}`}>
                          {task.priority}
                        </span>
                        {scope === 'all' && assignee && (
                          <div
                            className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-semibold"
                            title={assignee.full_name || assignee.email}
                          >
                            {avatarText(assignee.full_name || assignee.email)}
                          </div>
                        )}
                      </div>
                      {/* Move buttons */}
                      {(isAdmin || task.assignee_id === currentUserId) && (
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
                          {COLS.filter(c => c.key !== col.key).map(c => (
                            <button
                              key={c.key}
                              onClick={() => moveTask(task.id, c.key)}
                              className="text-[10px] text-gray-500 hover:text-blue-600 border border-gray-200 rounded px-1.5 py-0.5 hover:border-blue-300 transition-colors"
                            >
                              → {c.label}
                            </button>
                          ))}
                          {isAdmin && (
                            <button
                              onClick={() => deleteTask(task.id)}
                              className="text-[10px] text-red-400 hover:text-red-600 border border-gray-200 rounded px-1.5 py-0.5 hover:border-red-300 ml-auto transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>

      {showModal && (
        <TaskModal
          task={editTask}
          profiles={profiles}
          currentUserId={currentUserId}
          defaultAssigneeId={scope === 'mine' && isAdmin ? currentUserId : undefined}
          isAdmin={isAdmin}
          onClose={() => setShowModal(false)}
          onSave={refresh}
        />
      )}
    </div>
  )
}
