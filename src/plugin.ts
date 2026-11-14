import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Plugin } from '@opencode/plugin'
import {
  buildConfigContribution,
  registerContribution,
} from './config-contribution.js'
import { makeVerifyTool } from './tools/verify.js'
import { makeVisualDiffTool } from './tools/visual-diff.js'

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets')

export default Plugin.define({
  id: 'croupier',
  async setup(ctx) {
    const contribution = await buildConfigContribution(assetsDir)
    await registerContribution(ctx as never, contribution)
    await ctx.tool.transform((editor) => {
      editor.add(makeVerifyTool(ctx.location.directory) as never)
      editor.add(makeVisualDiffTool(ctx.location.directory) as never)
    })
  },
})
