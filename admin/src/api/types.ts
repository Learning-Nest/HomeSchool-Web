export type PlatformRole = 'content_admin' | 'super_admin'

export interface User {
  id: string
  email: string
  full_name: string
  platform_role?: string | null
}

export interface TokenOut {
  access_token: string
  refresh_token: string
  expires_in: number
  user: User
}

export interface AdminStats {
  users: number
  families: number
  skills: number
  activities_by_status: Record<string, number>
}

export type ActivityStatus = 'draft' | 'in_review' | 'published' | 'archived'

export interface AdminActivitySummary {
  id: string
  slug: string
  title: string
  summary: string | null
  subject_code: string
  level_from: string
  level_to: string
  duration_min: number
  materials: string[]
  interest_tags: string[]
  version: number
  status: string
  updated_at: string
}

export interface AdminActivityDetail extends AdminActivitySummary {
  skills: string[]
  definition: Record<string, unknown>
}

export interface Subject {
  code: string
  name: string
  display_order: number
}

export interface BundleReport {
  dry_run: boolean
  ok: boolean
  problems: string[]
  created: Record<string, number>
  updated: Record<string, number>
  unchanged: Record<string, number>
}

/** The launch-bundle format: taxonomy plus activities. Entries are validated by the server. */
export interface Bundle {
  version: string
  levels: Record<string, unknown>[]
  subjects: Record<string, unknown>[]
  interests: Record<string, unknown>[]
  skills: Record<string, unknown>[]
  activities: Record<string, unknown>[]
}
