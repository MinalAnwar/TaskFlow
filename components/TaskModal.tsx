'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Task, Profile } from '@/lib/types'

export default function TaskModal({
  task, profiles, currentUserId, defaultAssigneeId, isAdmin, onClose, onSave
}: {
  task: Task | null
  profiles: Profile[]
  currentUserId: string
  defaultAssigneeId?: string
  isAdmin: boolean
  onClose: () => void
  onSave: () => void
}) {
  const [title, setTitle] = useState(task?.title || '')
  const [description, setDescription] = useState(task?.description || '')
  const [priority, setPriority] = useState(task?.priority || 'medium')
  const [status, setStatus] = useState(task?.status || 'todo')
  const [assigneeId, setAssigneeId] = useState(task?.assignee_id || defaultAssigneeId || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const isMine = !!task && task.assignee_id === currentUserId
  // Title/description/priority: free to set on create, admin-only to edit after.
  const canEditDetails = isAdmin || !task
  const canEditStatus = isAdmin || isMine
  // Viewing someone else's existing task with no permission to change anything on it.
  const readOnly = !!task && !isAdmin && !isMine
  const assignee = profiles.find(p => p.id === assigneeId)

  async function save() {
    if (!title.trim()) { setError('Title is required.'); return }
    setLoading(true); setError('')
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      priority, status,
      assignee_id: assigneeId || null,
      assignee_email: profiles.find(p => p.id === assigneeId)?.email || null,
      updated_at: new Date().toISOString(),
    }
    let err
    if (task) {
      ({ error: err } = await supabase.from('tasks').update(payload).eq('id', task.id))
    } else {
      ({ error: err } = await supabase.from('tasks').insert({ ...payload, created_by: currentUserId }))
    }
    setLoading(false)
    if (err) { setError(err.message); return }
    onSave(); onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-base font-semibold">{task ? 'Edit task' : 'New task'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="px-6 py-4 space-y-4">
          {readOnly && (
            <p className="text-xs text-gray-500 bg-gray-50 px-3 py-2 rounded-lg">
              View only — this task isn't assigned to you.
            </p>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
            <input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              disabled={!canEditDetails}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Optional details…"
              rows={3}
              disabled={!canEditDetails}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none disabled:bg-gray-50 disabled:text-gray-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Assignee</label>
              {isAdmin ? (
                <select
                  value={assigneeId} onChange={e => setAssigneeId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Unassigned</option>
                  {profiles.map(p => (
                    <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                  ))}
                </select>
              ) : (
                <p className="w-full border border-gray-200 bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-500">
                  {assignee ? (assignee.full_name || assignee.email) : 'Unassigned'}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
              <select
                value={priority} onChange={e => setPriority(e.target.value as any)}
                disabled={!canEditDetails}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
            <select
              value={status} onChange={e => setStatus(e.target.value as any)}
              disabled={!canEditStatus}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
            >
              <option value="todo">To do</option>
              <option value="inprogress">In progress</option>
              <option value="done">Done</option>
            </select>
          </div>
          {!isAdmin && !readOnly && (
            <p className="text-xs text-gray-400">
              {task ? 'Only admins can edit task details or reassign this task.' : 'New tasks are created unassigned — an admin will assign them.'}
            </p>
          )}
          {error && <p className="text-red-600 text-sm bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
            {readOnly ? 'Close' : 'Cancel'}
          </button>
          {!readOnly && (
            <button
              onClick={save} disabled={loading}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
            >
              {loading ? 'Saving…' : task ? 'Save changes' : 'Create task'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
