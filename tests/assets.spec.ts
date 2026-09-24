import { describe, it, expect } from "vitest";
import { loadAgentDefinitions, loadCommand, skillsDir } from "../src/assets.js";

const ASSETS = "assets";

describe("assets", () => {
  it("carga los seis agentes con prompt no vacío", async () => {
    const agents = await loadAgentDefinitions(ASSETS);
    expect(agents.map((a) => a.name)).toEqual([
      "croupier-implementer",
      "croupier-orchestrator",
      "croupier-planner",
      "croupier-reviewer",
      "croupier-test-writer",
      "croupier-visual-reporter",
    ]);
    for (const agent of agents) {
      expect(agent.config.prompt.trim().length).toBeGreaterThan(0);
      expect(agent.config.description.length).toBeGreaterThan(0);
    }
  });

  it("no expone model en ningún agente", async () => {
    const agents = await loadAgentDefinitions(ASSETS);
    for (const agent of agents) {
      expect((agent.config as Record<string, unknown>).model).toBeUndefined();
    }
  });

  it("carga el comando croupier", async () => {
    const command = await loadCommand(ASSETS);
    expect(command?.agent).toBe("croupier-orchestrator");
    expect(command?.template.trim().length).toBeGreaterThan(0);
  });

  it("devuelve la ruta de skills", () => {
    expect(skillsDir(ASSETS)).toMatch(/assets\/skills$/);
  });
});