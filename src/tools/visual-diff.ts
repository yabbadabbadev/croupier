import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import type { PluginTool } from './plugin-tool.js'

export interface DiffResult {
  diffPixels: number
  totalPixels: number
  ratio: number
  diffPng: Buffer
}

export function diffPngs(
  bufferA: Uint8Array,
  bufferB: Uint8Array,
  threshold = 0.1,
): DiffResult {
  const a = PNG.sync.read(Buffer.from(bufferA))
  const b = PNG.sync.read(Buffer.from(bufferB))
  if (a.width !== b.width || a.height !== b.height) {
    throw new Error(
      `Image dimensions differ: ${a.width}x${a.height} vs ${b.width}x${b.height}`,
    )
  }
  const diff = new PNG({ width: a.width, height: a.height })
  const diffPixels = pixelmatch(a.data, b.data, diff.data, a.width, a.height, {
    threshold,
  })
  const totalPixels = a.width * a.height
  return {
    diffPixels,
    totalPixels,
    ratio: totalPixels === 0 ? 0 : diffPixels / totalPixels,
    diffPng: PNG.sync.write(diff),
  }
}

interface VisualDiffInput {
  before: string
  after: string
  diff?: string
}

/**
 * Construye la tool `croupier_visual_diff` para un directorio de proyecto dado.
 * Las rutas se resuelven contra el directorio capturado desde `ctx.location.directory`.
 */
export function makeVisualDiffTool(
  directory: string,
): PluginTool<VisualDiffInput> {
  return {
    name: 'croupier_visual_diff',
    description:
      'Compara dos PNG (before/after) y devuelve el ratio de píxeles distintos; opcionalmente escribe la imagen de diff.',
    input: {
      type: 'object',
      properties: {
        before: {
          type: 'string',
          description: 'Ruta del PNG before, relativa al proyecto',
        },
        after: {
          type: 'string',
          description: 'Ruta del PNG after, relativa al proyecto',
        },
        diff: {
          type: 'string',
          description: 'Ruta donde escribir la imagen de diff',
        },
      },
      required: ['before', 'after'],
      additionalProperties: false,
    },
    async execute(args) {
      const before = resolve(directory, args.before)
      const after = resolve(directory, args.after)
      const result = diffPngs(readFileSync(before), readFileSync(after))
      if (args.diff)
        writeFileSync(resolve(directory, args.diff), result.diffPng)
      return {
        content: JSON.stringify(
          {
            ratio: result.ratio,
            diffPixels: result.diffPixels,
            totalPixels: result.totalPixels,
            diffPath: args.diff ?? null,
          },
          null,
          2,
        ),
      }
    },
  }
}
