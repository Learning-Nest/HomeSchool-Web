import { createContext, useContext, type ReactNode } from 'react'
import type { AssetInfo, Skill } from '../../api/types'

export const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/** What the exercise forms need from the page around them: the pictures, the skill list and whether editing is allowed. */
export interface BuilderEnv {
  assets: readonly AssetInfo[]
  skills: readonly Skill[]
  /** Uploads a picture to this activity and returns it (the page also adds it to `assets`). */
  upload(file: File): Promise<AssetInfo>
  readOnly: boolean
}

const BuilderContext = createContext<BuilderEnv | null>(null)

export function BuilderProvider({ env, children }: { env: BuilderEnv; children: ReactNode }) {
  return <BuilderContext value={env}>{children}</BuilderContext>
}

export function useBuilder(): BuilderEnv {
  const value = useContext(BuilderContext)
  if (!value) throw new Error('useBuilder must be used inside <BuilderProvider>')
  return value
}
