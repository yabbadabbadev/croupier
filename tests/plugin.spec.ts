import { describe, it, expect } from 'vitest'
import plugin from '../src/plugin.js'

describe('croupier plugin (API V2)', () => {
  it('exporta una definición V2 con id y setup', () => {
    expect(plugin.id).toBe('croupier')
    expect(typeof plugin.setup).toBe('function')
  })

  it('setup registra las dos tools y el contribution', async () => {
    const tools: string[] = []
    const registered: string[] = []
    const ctx = {
      location: { directory: '/proj' },
      tool: {
        transform: async (cb: any) =>
          cb({ add: (t: any) => tools.push(t.name) }),
      },
      agent: {
        transform: async (cb: any) =>
          cb({ update: (id: string) => registered.push(`agent:${id}`) }),
      },
      command: {
        transform: async (cb: any) =>
          cb({ add: (d: any) => registered.push(`command:${d.name}`) }),
      },
      skill: {
        transform: async (cb: any) =>
          cb({ add: (s: any) => registered.push(`skill:${s.id}`) }),
      },
      mcp: {
        transform: async (cb: any) =>
          cb({
            get: () => undefined,
            set: (n: string) => registered.push(`mcp:${n}`),
          }),
      },
    }

    await plugin.setup(ctx as never)

    expect(tools.sort()).toEqual(['croupier_verify', 'croupier_visual_diff'])
    expect(registered).toContain('agent:croupier-orchestrator')
    expect(registered).toContain('agent:croupier-implementer')
    expect(registered).toContain('command:croupier')
    expect(registered).toContain('skill:croupier-workflow')
    expect(registered).toContain('mcp:chrome-devtools')
  })
})
