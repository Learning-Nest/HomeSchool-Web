import type { ApiClient } from './client'
import type {
  ActivityStatus,
  AdminActivityDetail,
  AdminActivitySummary,
  AdminStats,
  Bundle,
  BundleReport,
  Subject,
} from './types'

export interface ActivityQuery {
  status?: string
  subject?: string
  q?: string
  limit: number
  offset: number
}

/** The endpoints of the content-admin API (/v1/admin/*). */
export function createAdminApi(client: ApiClient) {
  return {
    stats: (signal?: AbortSignal) => client.get<AdminStats>('/admin/stats', { signal }),
    subjects: (signal?: AbortSignal) => client.get<Subject[]>('/curriculum/subjects', { signal }),
    listActivities: (query: ActivityQuery, signal?: AbortSignal) =>
      client.get<AdminActivitySummary[]>('/admin/activities', { query: { ...query }, signal }),
    getActivity: (id: string, signal?: AbortSignal) =>
      client.get<AdminActivityDetail>(`/admin/activities/${encodeURIComponent(id)}`, { signal }),
    putDefinition: (id: string, definition: Record<string, unknown>) =>
      client.put<AdminActivityDetail>(`/admin/activities/${encodeURIComponent(id)}/definition`, { definition }),
    setStatus: (id: string, status: ActivityStatus) =>
      client.post<AdminActivityDetail>(`/admin/activities/${encodeURIComponent(id)}/status`, { status }),
    importBundle: (bundle: Bundle, options: { dryRun: boolean; autoPublish: boolean }) =>
      client.post<BundleReport>('/admin/content/bundle', {
        ...bundle,
        dry_run: options.dryRun,
        auto_publish: options.autoPublish,
      }),
  }
}

export type AdminApi = ReturnType<typeof createAdminApi>
