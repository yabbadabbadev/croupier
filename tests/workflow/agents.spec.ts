import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const AGENTS_DIR = "assets/agents";

interface LoadedAgent {
  name: string;
  front: Record<string, any>;
  body: string;
}

function loadAgents(): LoadedAgent[] {
  return readdirSync(AGENTS_DIR)
    .filter((file) => file.endsWith(".md"))
    .map((file) => {
      const raw = readFileSync(join(AGENTS_DIR, file), "utf8");
      const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!match) throw new Error(`Missing frontmatter in ${file}`);
      return { name: file.replace(/\.md$/, ""), front: parse(match[1]), body: match[2] };
    });
}

const agents = loadAgents();
const byName = new Map(agents.map((agent) => [agent.name, agent]));

describe("definiciones de agente", () => {
  it("define exactamente el roster esperado", () => {
    const names = agents.map((agent) => agent.name).sort();
    expect(names).toEqual([
      "croupier-implementer",
      "croupier-orchestrator",
      "croupier-planner",
      "croupier-reviewer",
      "croupier-test-writer",
      "croupier-visual-reporter",
    ]);
  });

  it("no fija model en ningún agente", () => {
    for (const agent of agents) {
      expect(agent.front.model).toBeUndefined();
    }
  });

  it("el orquestador es primary y no hidden", () => {
    const orchestrator = byName.get("croupier-orchestrator")!;
    expect(orchestrator.front.mode).toBe("primary");
    expect(orchestrator.front.hidden).not.toBe(true);
  });

  it("el orquestador solo puede invocar subagentes croupier-*", () => {
    const orchestrator = byName.get("croupier-orchestrator")!;
    expect(orchestrator.front.permission.task).toMatchObject({
      "*": "deny",
      "croupier-*": "allow",
    });
  });

  it("todos los subagentes son subagent y hidden", () => {
    for (const name of [
      "croupier-planner",
      "croupier-test-writer",
      "croupier-implementer",
      "croupier-reviewer",
      "croupier-visual-reporter",
    ]) {
      const agent = byName.get(name)!;
      expect(agent.front.mode).toBe("subagent");
      expect(agent.front.hidden).toBe(true);
    }
  });

  it("el reviewer no puede editar", () => {
    const reviewer = byName.get("croupier-reviewer")!;
    expect(reviewer.front.permission.edit).toBe("deny");
  });

  it("el visual-reporter limita la edición a reportes", () => {
    const reporter = byName.get("croupier-visual-reporter")!;
    expect(reporter.front.permission.edit).toMatchObject({
      "*": "deny",
      "docs/reports/**": "allow",
      ".croupier/reports/**": "allow",
    });
  });

  it("cada agente tiene descripción y prompt no vacíos", () => {
    for (const agent of agents) {
      expect(typeof agent.front.description).toBe("string");
      expect(agent.front.description.length).toBeGreaterThan(0);
      expect(agent.body.trim().length).toBeGreaterThan(0);
    }
  });
});