import { describe, it, expect } from 'vitest'
import { CroupierPlugin } from '../src/plugin.js'

describe('CroupierPlugin', () => {
  it('registra los hooks config y tool', async () => {
    const hooks = await CroupierPlugin({} as never)
    expect(typeof hooks.config).toBe('function')
    expect(hooks.tool).toBeDefined()
  })

  it('el hook config inyecta el roster en una config vacía', async () => {
    const hooks = await CroupierPlugin({} as never)
    const cfg: Record<string, any> = {}
    await hooks.config?.(cfg as never)
    expect(Object.keys(cfg.agent).sort()).toEqual([
      'croupier-implementer',
      'croupier-orchestrator',
      'croupier-performance',
      'croupier-planner',
      'croupier-reviewer',
      'croupier-test-writer',
      'croupier-visual-reporter',
    ])
  })
})
