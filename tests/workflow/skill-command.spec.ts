import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const SKILL_PATH = "assets/skills/croupier-workflow/SKILL.md";
const COMMAND_PATH = "assets/commands/croupier.md";

function frontmatter(raw: string): Record<string, any> {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) throw new Error("Missing frontmatter");
  return parse(match[1]);
}

const skillRaw = readFileSync(SKILL_PATH, "utf8");
const commandRaw = readFileSync(COMMAND_PATH, "utf8");

describe("skill croupier-workflow", () => {
  it("declara name igual a la carpeta y una description", () => {
    const front = frontmatter(skillRaw);
    expect(front.name).toBe("croupier-workflow");
    expect(typeof front.description).toBe("string");
    expect(front.description.length).toBeGreaterThan(0);
  });

  it("describe el flujo por slice y el gate humano", () => {
    expect(skillRaw).toMatch(/gate humano/i);
    expect(skillRaw).toContain("progress.md");
    expect(skillRaw).toContain("scripts/verify.mjs");
    expect(skillRaw).toContain("scripts/visual-diff.mjs");
  });

  it("nombra a todos los subagentes del roster", () => {
    for (const name of [
      "croupier-planner",
      "croupier-test-writer",
      "croupier-implementer",
      "croupier-reviewer",
      "croupier-visual-reporter",
    ]) {
      expect(skillRaw).toContain(name);
    }
  });
});

describe("comando croupier", () => {
  it("ejecuta el agente orquestador", () => {
    const front = frontmatter(commandRaw);
    expect(front.agent).toBe("croupier-orchestrator");
    expect(typeof front.description).toBe("string");
  });

  it("tiene un template no vacío", () => {
    const body = commandRaw.split("---")[2] ?? "";
    expect(body.trim().length).toBeGreaterThan(0);
  });
});