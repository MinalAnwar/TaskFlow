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
