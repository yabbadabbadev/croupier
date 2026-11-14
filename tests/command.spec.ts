import { describe, it, expect } from 'vitest'
import { expandTemplate, makeCommandExecute } from '../src/command.js'

describe('expandTemplate', () => {
  it('sustituye $ARGUMENTS', () => {
    expect(expandTemplate('Ejecuta: $ARGUMENTS', 'slice 1')).toBe(
      'Ejecuta: slice 1',
    )
  })
  it('sustituye posicionales $1..$n', () => {
    expect(expandTemplate('$1 y $2', 'a b')).toBe('a y b')
  })
  it('añade args tras línea en blanco si no hay placeholder', () => {
    expect(expandTemplate('Hazlo', 'extra')).toBe('Hazlo\n\nextra')
  })
  it('sin args ni placeholder devuelve el template', () => {
    expect(expandTemplate('Hazlo', '')).toBe('Hazlo')
  })
})

describe('makeCommandExecute', () => {
  it('selecciona el agente y envía el prompt con UN solo argumento', async () => {
    const calls: unknown[] = []
    const session = {
      switchAgent: async (i: { agent: string }) =>
        calls.push(['agent', i.agent]),
      prompt: async (i: { text: string }) => calls.push(['prompt', i.text]),
    }
    const exec = makeCommandExecute(
      {
        description: 'd',
        agent: 'croupier-orchestrator',
        template: 'Ejecuta $ARGUMENTS',
      },
      session,
    )
    await exec({
      sessionID: 's',
      prompt: { text: 'slice 1' },
      delivery: 'steer',
    })
    expect(calls).toEqual([
      ['agent', 'croupier-orchestrator'],
      ['prompt', 'Ejecuta slice 1'],
    ])
  })

  it('conserva los adjuntos del prompt', async () => {
    let sent: Record<string, unknown> | undefined
    const session = {
      switchAgent: async () => {},
      prompt: async (i: Record<string, unknown>) => {
        sent = i
      },
    }
    const exec = makeCommandExecute(
      { description: 'd', agent: 'a', template: '$ARGUMENTS' },
      session,
    )
    await exec({
      sessionID: 's',
      prompt: { text: 'x', files: [{ uri: 'file:///f' }] },
      delivery: 'steer',
    })
    expect(sent?.files).toEqual([{ uri: 'file:///f' }])
  })
})
