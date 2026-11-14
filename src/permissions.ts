import type { PermissionRule } from './config-contribution.js'

/** Renombrados de acción V1 → V2 (el resto pasa igual). */
const ACTION_ALIASES: Record<string, string> = {
  bash: 'shell',
  task: 'subagent',
  write: 'edit',
  patch: 'edit',
}

const isEffect = (v: unknown): v is PermissionRule['effect'] =>
  v === 'allow' || v === 'deny' || v === 'ask'

/**
 * Convierte un mapa de permisos (formato V1 del frontmatter de agentes) al array
 * ordenado de reglas V2. Preserva el orden (gana la última coincidencia) y aplica
 * los renombrados de acción (`bash`→`shell`, `task`→`subagent`, `write`/`patch`→`edit`).
 */
export function permissionToRules(
  permission: Record<string, unknown> | undefined,
): PermissionRule[] {
  if (!permission) return []
  const rules: PermissionRule[] = []
  for (const [key, value] of Object.entries(permission)) {
    const action = ACTION_ALIASES[key] ?? key
    if (isEffect(value)) {
      rules.push({ action, resource: '*', effect: value })
    } else if (value && typeof value === 'object') {
      for (const [resource, effect] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (isEffect(effect)) rules.push({ action, resource, effect })
      }
    }
  }
  return rules
}
