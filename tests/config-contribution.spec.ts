import { describe, it, expect } from "vitest";
import { applyConfigContribution } from "../src/config-contribution.js";

describe("applyConfigContribution", () => {
  it("inyecta agentes, comando, skills y mcp en una config vacía", () => {
    const cfg: Record<string, any> = {};
    applyConfigContribution(cfg, {
      agents: {
        "croupier-orchestrator": {
          description: "orquesta",
          mode: "primary",
          prompt: "eres el orquestador",
          permission: { edit: "deny" },
        },
      },
      command: { description: "cmd", agent: "croupier-orchestrator", template: "$ARGUMENTS" },
      skillsPaths: ["/pkg/assets/skills"],
      mcp: {
        "chrome-devtools": {
          type: "local",
          command: ["npx", "-y", "chrome-devtools-mcp@latest", "--headless"],
          enabled: true,
        },
      },
    });

    expect(cfg.agent["croupier-orchestrator"]).toMatchObject({
      mode: "primary",
      prompt: "eres el orquestador",
    });
    expect(cfg.command.croupier).toMatchObject({ agent: "croupier-orchestrator" });
    expect(cfg.skills.paths).toEqual(["/pkg/assets/skills"]);
    expect(cfg.mcp["chrome-devtools"]).toMatchObject({ type: "local", enabled: true });
  });

  it("no pisa overrides del usuario en un agente", () => {
    const cfg: Record<string, any> = {
      agent: { "croupier-implementer": { model: "openrouter/x" } },
    };
    applyConfigContribution(cfg, {
      agents: {
        "croupier-implementer": {
          description: "implementa",
          mode: "subagent",
          hidden: true,
          prompt: "eres el implementador",
        },
      },
      skillsPaths: [],
      mcp: {},
    });

    expect(cfg.agent["croupier-implementer"].model).toBe("openrouter/x");
    expect(cfg.agent["croupier-implementer"].prompt).toBe("eres el implementador");
  });

  it("no duplica el skills path ni el mcp existente", () => {
    const cfg: Record<string, any> = {
      skills: { paths: ["/pkg/assets/skills"] },
      mcp: { "chrome-devtools": { type: "local", command: ["custom"], enabled: false } },
    };
    applyConfigContribution(cfg, {
      agents: {},
      skillsPaths: ["/pkg/assets/skills"],
      mcp: {
        "chrome-devtools": {
          type: "local",
          command: ["npx", "-y", "chrome-devtools-mcp@latest"],
          enabled: true,
        },
      },
    });

    expect(cfg.skills.paths).toEqual(["/pkg/assets/skills"]);
    expect(cfg.mcp["chrome-devtools"].command).toEqual(["custom"]);
    expect(cfg.mcp["chrome-devtools"].enabled).toBe(false);
  });
});