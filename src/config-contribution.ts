export interface AgentConfigContribution {
  description: string;
  mode: "primary" | "subagent" | "all";
  hidden?: boolean;
  temperature?: number;
  permission?: Record<string, unknown>;
  prompt: string;
}

export interface CommandContribution {
  description: string;
  agent: string;
  template: string;
}

export interface McpContribution {
  type: "local";
  command: string[];
  enabled: boolean;
}

export interface ConfigContribution {
  agents: Record<string, AgentConfigContribution>;
  command?: CommandContribution;
  skillsPaths: string[];
  mcp: Record<string, McpContribution>;
}

import { join } from "node:path";
import { loadAgentDefinitions, loadCommand, skillsDir } from "./assets.js";

export interface BuildOptions {
  mcp?: boolean;
}

export async function buildConfigContribution(
  assetsDir: string,
  options: BuildOptions = {}
): Promise<ConfigContribution> {
  const loaded = await loadAgentDefinitions(assetsDir);
  const agents: Record<string, AgentConfigContribution> = {};
  for (const agent of loaded) agents[agent.name] = agent.config;

  const command = await loadCommand(assetsDir);
  const includeMcp = options.mcp !== false;

  return {
    agents,
    ...(command ? { command } : {}),
    skillsPaths: [skillsDir(assetsDir)],
    mcp: includeMcp
      ? {
          "chrome-devtools": {
            type: "local",
            command: ["npx", "-y", "chrome-devtools-mcp@latest", "--headless", "--isolated"],
            enabled: true,
          },
        }
      : {},
  };
}

export function applyConfigContribution(
  cfg: Record<string, any>,
  contribution: ConfigContribution
): void {
  cfg.agent = cfg.agent ?? {};
  for (const [name, defaults] of Object.entries(contribution.agents)) {
    cfg.agent[name] = { ...defaults, ...(cfg.agent[name] ?? {}) };
  }

  if (contribution.command && !cfg.command?.["croupier"]) {
    cfg.command = cfg.command ?? {};
    cfg.command["croupier"] = contribution.command;
  }

  if (contribution.skillsPaths.length > 0) {
    cfg.skills = cfg.skills ?? {};
    const existing: string[] = cfg.skills.paths ?? [];
    for (const path of contribution.skillsPaths) {
      if (!existing.includes(path)) existing.push(path);
    }
    cfg.skills.paths = existing;
  }

  cfg.mcp = cfg.mcp ?? {};
  for (const [name, defaults] of Object.entries(contribution.mcp)) {
    if (!cfg.mcp[name]) cfg.mcp[name] = defaults;
  }
}