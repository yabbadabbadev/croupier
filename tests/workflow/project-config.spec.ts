import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const config = JSON.parse(readFileSync('.opencode/opencode.json', 'utf8'))
const gitignore = readFileSync('.gitignore', 'utf8')

describe('config de proyecto', () => {
  it('declara el schema', () => {
    expect(config.$schema).toBe('https://opencode.ai/config.json')
  })

  it('habilita el MCP de chrome-devtools en local y headless', () => {
    const mcp = config.mcp?.['chrome-devtools']
    expect(mcp).toBeDefined()
    expect(mcp.type).toBe('local')
    expect(Array.isArray(mcp.command)).toBe(true)
    expect(mcp.command.join(' ')).toContain('chrome-devtools-mcp')
    expect(mcp.command).toContain('--headless')
    expect(mcp.enabled).toBe(true)
  })
})

describe('gitignore', () => {
  it('ignora el directorio de reportes por defecto', () => {
    expect(gitignore).toContain('.croupier/')
  })
})
