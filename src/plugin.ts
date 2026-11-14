import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from '@opencode-ai/plugin'
import {
  applyConfigContribution,
  buildConfigContribution,
} from './config-contribution.js'
import { makeVerifyTool } from './tools/verify.js'
import { makeVisualDiffTool } from './tools/visual-diff.js'

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

export const CroupierPlugin: Plugin = async ({ directory }) => {
  return {
    tool: {
      // Cast temporal: el shape V2 de las tools no encaja con el tipo V1 de `Plugin`.
      // Se elimina al portar el entrypoint (Task 5).
      croupier_verify: makeVerifyTool(directory),
      croupier_visual_diff: makeVisualDiffTool(directory),
    } as never,
    config: async (cfg) => {
      const contribution = await buildConfigContribution(assetsDir)
      applyConfigContribution(
        cfg as unknown as Record<string, any>,
        contribution,
      )
    },
  }
}
