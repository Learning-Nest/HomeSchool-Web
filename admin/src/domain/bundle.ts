import type { Bundle, BundleReport } from '../api/types'
import { parseJsonObject } from './json'

export const BUNDLE_ENTITIES = ['levels', 'subjects', 'interests', 'skills', 'activities'] as const
export const MAX_BUNDLE_BYTES = 5 * 1024 * 1024

export type BundleParse =
  | { ok: true; bundle: Bundle; counts: Record<(typeof BUNDLE_ENTITIES)[number], number> }
  | { ok: false; message: string }

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Checks the file shape ({version, levels, subjects, interests, skills, activities}); the server validates the content. */
export function parseBundleText(text: string): BundleParse {
  const parsed = parseJsonObject(text)
  if (!parsed.ok) {
    const { message, line, column } = parsed.error
    return { ok: false, message: `Not valid JSON (line ${line}, column ${column}): ${message}` }
  }
  const raw = parsed.value
  if (typeof raw.version !== 'string' || raw.version.trim() === '') {
    return { ok: false, message: 'The bundle needs a "version" string, for example "2026.09.1".' }
  }
  if (raw.version.length > 40) return { ok: false, message: 'The bundle "version" can be at most 40 characters.' }

  const lists = {} as Record<(typeof BUNDLE_ENTITIES)[number], Record<string, unknown>[]>
  for (const key of BUNDLE_ENTITIES) {
    const list = raw[key] ?? []
    if (!Array.isArray(list) || !list.every(isObject)) {
      return { ok: false, message: `"${key}" must be a list of objects.` }
    }
    lists[key] = list
  }
  const counts = Object.fromEntries(BUNDLE_ENTITIES.map((k) => [k, lists[k].length])) as Record<
    (typeof BUNDLE_ENTITIES)[number],
    number
  >
  return { ok: true, bundle: { version: raw.version.trim(), ...lists }, counts }
}

export interface ReportRow {
  entity: string
  created: number
  updated: number
  unchanged: number
}

/** One row per entity, known entities first, in the order the bundle lists them. */
export function reportRows(report: BundleReport): ReportRow[] {
  const keys = new Set<string>([
    ...BUNDLE_ENTITIES,
    ...Object.keys(report.created),
    ...Object.keys(report.updated),
    ...Object.keys(report.unchanged),
  ])
  return [...keys].map((entity) => ({
    entity,
    created: report.created[entity] ?? 0,
    updated: report.updated[entity] ?? 0,
    unchanged: report.unchanged[entity] ?? 0,
  }))
}

export function reportTotals(rows: ReportRow[]): Omit<ReportRow, 'entity'> {
  return rows.reduce(
    (t, r) => ({ created: t.created + r.created, updated: t.updated + r.updated, unchanged: t.unchanged + r.unchanged }),
    { created: 0, updated: 0, unchanged: 0 },
  )
}
