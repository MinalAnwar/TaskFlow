'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { TaskComment, Profile } from '@/lib/types'

function avatarText(s: string) {
  return s.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function renderBody(body: string, profiles: Profile[]) {
  const names = profiles.map(p => p.full_name || p.email).filter(Boolean)
  if (names.length === 0) return body
  const pattern = new RegExp(`@(${[...names].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`, 'g')
  const parts: (string | JSX.Element)[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(body))) {
    if (match.index > lastIndex) parts.push(body.slice(lastIndex, match.index))
    parts.push(<span key={key++} className="text-blue-600 font-medium">{match[0]}</span>)
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < body.length) parts.push(body.slice(lastIndex))
  return parts
}

export default function TaskComments({
  taskId, profiles, currentUserId
}: {
  taskId: string; profiles: Profile[]; currentUserId: string
}) {
  const [comments, setComments] = useState<TaskComment[]>([])
  const [body, setBody] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionQuery, setMentionQuery] = useState('')
  const [mentionedIds, setMentionedIds] = useState<Set<string>>(new Set())
  const [posting, setPosting] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const supabase = createClient()

  const refresh = useCallback(async () => {
    const { data } = await supabase.from('task_comments').select('*').eq('task_id', taskId).order('created_at', { ascending: true })
    if (data) setComments(data)
  }, [supabase, taskId])

  useEffect(() => { refresh() }, [refresh])

  useEffect(() => {
    const channel = supabase
      .channel(`task-comments-${taskId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'task_comments', filter: `task_id=eq.${taskId}` }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [supabase, taskId, refresh])

  useEffect(() => {
    if (comments.length === 0) return
    supabase.from('comment_mentions')
      .update({ read_at: new Date().toISOString() })
      .eq('mentioned_id', currentUserId)
      .is('read_at', null)
      .in('comment_id', comments.map(c => c.id))
      .then(() => {})
  }, [comments, currentUserId, supabase])

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value
    setBody(value)
    const cursor = e.target.selectionStart
    const match = value.slice(0, cursor).match(/@([\w.]*)$/)
    if (match) {
      setMentionQuery(match[1].toLowerCase())
      setShowMentions(true)
    } else {
      setShowMentions(false)
    }
  }

  function pickMention(p: Profile) {
    const name = p.full_name || p.email
    const cursor = textareaRef.current?.selectionStart ?? body.length
    const before = body.slice(0, cursor).replace(/@([\w.]*)$/, `@${name} `)
    setBody(before + body.slice(cursor))
    setMentionedIds(prev => new Set(prev).add(p.id))
    setShowMentions(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const filteredProfiles = profiles.filter(p => (p.full_name || p.email).toLowerCase().includes(mentionQuery))

  async function post() {
    if (!body.trim()) return
    setPosting(true)
    const { data, error } = await supabase
      .from('task_comments')
      .insert({ task_id: taskId, author_id: currentUserId, body: body.trim() })
      .select()
      .single()
    if (!error && data) {
      const ids = Array.from(mentionedIds).filter(id => id !== currentUserId)
      if (ids.length > 0) {
        await supabase.from('comment_mentions').insert(ids.map(mentioned_id => ({ comment_id: data.id, mentioned_id })))
      }
    }
    setBody('')
    setMentionedIds(new Set())
    setPosting(false)
    refresh()
  }

  return (
    <div>
      <h3 className="text-sm font-medium text-gray-700 mb-2">Comments</h3>
      <div className="space-y-3 max-h-48 overflow-y-auto mb-3 pr-1">
        {comments.length === 0 && <p className="text-xs text-gray-400">No comments yet.</p>}
        {comments.map(c => {
          const author = profiles.find(p => p.id === c.author_id)
          return (
            <div key={c.id} className="flex gap-2">
              <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-semibold flex-shrink-0">
                {avatarText(author?.full_name || author?.email || '?')}
              </div>
              <div className="min-w-0">
                <p className="text-xs text-gray-400">
                  {author?.full_name || author?.email || 'Unknown'} · {new Date(c.created_at).toLocaleString()}
                </p>
                <p className="text-sm text-gray-700 whitespace-pre-wrap break-words">{renderBody(c.body, profiles)}</p>
              </div>
            </div>
          )
        })}
      </div>
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleChange}
          placeholder="Ask a question, tag someone with @…"
          rows={2}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
        />
        {showMentions && filteredProfiles.length > 0 && (
          <div className="absolute z-10 bottom-full mb-1 left-0 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto w-56">
            {filteredProfiles.map(p => (
              <button
                key={p.id}
                onClick={() => pickMention(p)}
                className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
              >
                {p.full_name || p.email}
              </button>
            ))}
          </div>
        )}
        <div className="flex justify-end mt-1.5">
          <button
            onClick={post}
            disabled={posting || !body.trim()}
            className="px-3 py-1.5 text-xs text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors font-medium"
          >
            {posting ? 'Posting…' : 'Post'}
          </button>
        </div>
      </div>
    </div>
  )
}
