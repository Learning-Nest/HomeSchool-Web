import type { ApiClient } from './client'
import type {
  ActivityEvent,
  ActivityStatus,
  AdminActivityDetail,
  AdminActivitySummary,
  AdminStats,
  AssetInfo,
  Bundle,
  BundleReport,
  EducatorActivity,
  EducatorCreated,
  EducatorInvited,
  EducatorSummary,
  Level,
  Skill,
  StaffMe,
  Subject,
  ValidationResult,
} from './types'

export interface ActivityQuery {
  status?: string
  subject?: string
  /** Only for admins: show one educator's activities. */
  author?: string
  q?: string
  limit: number
  offset: number
}

export interface LogQuery {
  actor_id?: string
  action?: string
  activity_id?: string
  /** Dates as YYYY-MM-DD. */
  from?: string
  to?: string
  limit?: number
  offset?: number
}

const seg = encodeURIComponent

/** The endpoints of the staff API (/v1/admin/*): educators use the writing half, admins everything. */
export function createAdminApi(client: ApiClient) {
  return {
    me: (signal?: AbortSignal) => client.get<StaffMe>('/admin/me', { signal }),
    stats: (signal?: AbortSignal) => client.get<AdminStats>('/admin/stats', { signal }),
    subjects: (signal?: AbortSignal) => client.get<Subject[]>('/curriculum/subjects', { signal }),
    levels: (signal?: AbortSignal) => client.get<Level[]>('/curriculum/levels', { signal }),
    skills: (query: { subject?: string } = {}, signal?: AbortSignal) =>
      client.get<Skill[]>('/curriculum/skills', { query: { ...query }, signal }),

    listActivities: (query: ActivityQuery, signal?: AbortSignal) =>
      client.get<AdminActivitySummary[]>('/admin/activities', { query: { ...query }, signal }),
    getActivity: (id: string, signal?: AbortSignal) =>
      client.get<AdminActivityDetail>(`/admin/activities/${seg(id)}`, { signal }),
    /** Creates a draft from the basics; everything else is checked later by Validate. */
    createActivity: (definition: Record<string, unknown>) =>
      client.post<AdminActivityDetail>('/admin/activities', { definition }),
    /** strict=false stores a half-finished draft (autosave); strict=true (admins, published edits) needs a valid one. */
    putDefinition: (id: string, definition: Record<string, unknown>, options: { strict?: boolean } = {}) =>
      client.put<AdminActivityDetail>(
        `/admin/activities/${seg(id)}/definition`,
        { definition },
        options.strict === undefined ? {} : { query: { strict: options.strict } },
      ),
    /** Dry run of the full check on unsaved content. Saves nothing. */
    checkDefinition: (definition: Record<string, unknown>, activityId?: string) =>
      client.post<ValidationResult>('/admin/activities/validate', { definition, activity_id: activityId ?? null }),
    /** Checks the SAVED content and records the result; Submit is only allowed while this exact content passed. */
    validateActivity: (id: string) => client.post<ValidationResult>(`/admin/activities/${seg(id)}/validate`, {}),
    submitActivity: (id: string) => client.post<AdminActivityDetail>(`/admin/activities/${seg(id)}/submit`, {}),
    setStatus: (id: string, status: ActivityStatus, note?: string) =>
      client.post<AdminActivityDetail>(
        `/admin/activities/${seg(id)}/status`,
        note ? { status, note } : { status },
      ),

    listAssets: (activityId: string, signal?: AbortSignal) =>
      client.get<AssetInfo[]>(`/admin/activities/${seg(activityId)}/assets`, { signal }),
    uploadAsset: (activityId: string, file: File) =>
      client.request<AssetInfo>('POST', '/admin/assets', {
        query: { activity_id: activityId },
        raw: { data: file, contentType: file.type },
      }),
    deleteAsset: (assetId: string) => client.delete(`/admin/assets/${seg(assetId)}`),

    importBundle: (bundle: Bundle, options: { dryRun: boolean; autoPublish: boolean }) =>
      client.post<BundleReport>('/admin/content/bundle', {
        ...bundle,
        dry_run: options.dryRun,
        auto_publish: options.autoPublish,
      }),

    listEducators: (signal?: AbortSignal) => client.get<EducatorSummary[]>('/admin/educators', { signal }),
    educatorActivity: (id: string, range: { from?: string; to?: string } = {}, signal?: AbortSignal) =>
      client.get<EducatorActivity>(`/admin/educators/${seg(id)}/activity`, { query: { ...range }, signal }),
    createEducator: (email: string, fullName: string) =>
      client.post<EducatorCreated>('/admin/educators', { email, full_name: fullName }),
    resendInvitation: (id: string) => client.post<EducatorInvited>(`/admin/educators/${seg(id)}/invite`, {}),
    setEducatorActive: (id: string, active: boolean) =>
      client.patch<EducatorSummary>(`/admin/educators/${seg(id)}`, { active }),

    activityLog: (query: LogQuery, signal?: AbortSignal) =>
      client.get<ActivityEvent[]>('/admin/activity-log', { query: { ...query }, signal }),
    activityLogCsv: (query: LogQuery) =>
      client.download('/admin/activity-log', { query: { ...query, format: 'csv' } }),
  }
}

export type AdminApi = ReturnType<typeof createAdminApi>
