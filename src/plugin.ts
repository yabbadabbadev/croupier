import type { Plugin } from "@opencode-ai/plugin";

export const CroupierPlugin: Plugin = async () => {
  return {
    config: async (cfg) => {
      const { applyConfigContribution } = await import("./config-contribution.js");
      applyConfigContribution(cfg as unknown as Record<string, any>, {
        agents: {
          "croupier-spike-probe": {
            description: "Spike: agente de prueba inyectado por el plugin.",
            mode: "primary",
            prompt: "Spike del plugin croupier. Si ves este agente, la inyeccion funciona.",
          },
        },
        skillsPaths: [],
        mcp: {},
      });
    },
  };
};