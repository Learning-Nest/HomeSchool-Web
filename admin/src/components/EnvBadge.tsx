import { config, envBadgeLabel } from '../config'

export function EnvBadge() {
  const label = envBadgeLabel(config.envName)
  if (!label) return null
  return (
    <span className={`env-badge env-${config.envName}`} title={`Connected to the ${config.envName} environment`}>
      {label}
    </span>
  )
}
