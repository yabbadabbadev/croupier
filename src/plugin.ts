import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "@opencode-ai/plugin";
import { applyConfigContribution, buildConfigContribution } from "./config-contribution.js";

const assetsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "assets");

export const CroupierPlugin: Plugin = async () => {
  return {
    tool: {},
    config: async (cfg) => {
      const contribution = await buildConfigContribution(assetsDir);
      applyConfigContribution(cfg as unknown as Record<string, any>, contribution);
    },
  };
};