export type Priority = 'low' | 'medium' | 'high'
export type Status = 'todo' | 'inprogress' | 'done'

export interface Task {
  id: string
  title: string
  description: string | null
  status: Status
  priority: Priority
  assignee_id: string | null
  assignee_email: string | null
  created_by: string
  created_at: string
  updated_at: string
}

export type Role = 'member' | 'admin' | 'superadmin'

export interface Profile {
  id: string
  email: string
  full_name: string | null
  role: Role
}

export interface TaskComment {
  id: string
  task_id: string
  author_id: string | null
  body: string
  created_at: string
}

export interface CommentMention {
  id: string
  comment_id: string
  mentioned_id: string
  read_at: string | null
  created_at: string
}

export type ActivityAction = 'created' | 'assigned' | 'unassigned' | 'status_changed' | 'priority_changed' | 'title_changed'

export interface TaskActivity {
  id: string
  task_id: string
  actor_id: string | null
  action: ActivityAction
  detail: Record<string, string | null>
  created_at: string
}
