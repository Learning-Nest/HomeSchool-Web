export type PlatformRole = 'educator' | 'content_admin' | 'super_admin'

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
  /** Signed in with an emailed temporary password: only a password change is allowed until it is done. */
  temp_login?: boolean
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
  // Authorship and review (added with the educator portal). Optional so older fixtures and servers still type-check.
  source?: string
  created_at?: string | null
  created_by?: string | null
  created_by_name?: string | null
  last_edited_by?: string | null
  last_edited_by_name?: string | null
  last_edited_at?: string | null
  submitted_at?: string | null
  reviewed_by?: string | null
  reviewed_by_name?: string | null
  reviewed_at?: string | null
  review_note?: string | null
  last_validated_at?: string | null
  is_validated?: boolean
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

export interface StaffMe {
  user_id: string
  email: string
  full_name: string
  platform_role: PlatformRole
  capabilities: string[]
}

export interface ValidationProblem {
  /** The exercise id the message is about, when it names one. */
  step: string | null
  message: string
}

export interface ValidationResult {
  ok: boolean
  problems: ValidationProblem[]
  validated_at?: string | null
}

export interface AssetInfo {
  id: string
  activity_id: string
  content_type: string
  bytes: number
  width: number
  height: number
  sha256: string
  created_at: string
  /** Short-lived signed preview link; ask for the list again when it expires. */
  url: string | null
}

export interface Skill {
  code: string
  subject_code: string
  level_code: string
  name: string
  prerequisites: string[]
}

export interface Level {
  code: string
  name: string
  indicative_age?: string | null
}

export interface EducatorSummary {
  id: string
  email: string
  full_name: string
  active: boolean
  platform_role: string
  created_at: string
  activities: number
  drafts: number
  in_review: number
  published: number
  submissions: number
  returned: number
  last_active_at: string | null
  /** True until they have signed in with a password of their own: an unused invitation can be resent. */
  invite_pending: boolean
}

export interface EducatorInvited {
  educator: EducatorSummary
  email_sent: boolean
}

export interface EducatorCreated {
  educator: EducatorSummary
  existing_account: boolean
  email_sent: boolean
}

export interface ActivityEvent {
  id: string
  at: string
  action: string
  actor_id: string | null
  actor_name: string | null
  activity_id: string
  activity_slug: string
  activity_title: string
  version: number | null
  status_from: string | null
  status_to: string | null
  detail: Record<string, unknown>
}

export interface EducatorActivity {
  educator: EducatorSummary
  activities: AdminActivitySummary[]
  events: ActivityEvent[]
}
