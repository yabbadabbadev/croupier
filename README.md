# croupier

An **opencode plugin** that installs an orchestrated, slice-by-slice frontend
development workflow driven by specialist subagents.

Write a feature spec with a `## Slices` section, run `/croupier`, and an
orchestrator agent plans one slice at a time, runs it through a deterministic
verify loop (red tests → green implementation → `tsc` + `vitest`), reviews it,
runs a performance check, captures before/after visual evidence, and **stops
at a human gate** before the next slice. It never advances without your
approval.

The plugin injects everything the workflow needs into your opencode config —
agents, the `/croupier` command, the `croupier-workflow` skill and a
`chrome-devtools` MCP server — **without overwriting anything you already
have**: your own `agent`, `command`, `skills` and `mcp` settings win over
plugin defaults. It also registers two deterministic tools (`croupier_verify`,
`croupier_visual_diff`).

See [`ROADMAP.md`](ROADMAP.md) for the project plan, what's done, and the
progress checklist.

## Requirements

- **Node.js >= 20** (see `.nvmrc`).
- **opencode** with plugin support (`@opencode-ai/plugin` `^1.18`).
- **The target project uses pnpm + `tsc` + `vitest`.** `croupier_verify` runs
  `pnpm exec tsc --noEmit` and `pnpm exec vitest run` in the project.
- For the visual step: the project must be runnable locally (a dev server) and
  Chrome reachable through `chrome-devtools-mcp` (fetched on demand via `npx`).

## Install

### Local (until the package is published on npm)

```bash
git clone https://github.com/yabbadabbadev/croupier.git
cd croupier
pnpm install
pnpm run build
```

Then point your opencode config at the built plugin. Use the **global** config
(`~/.config/opencode/opencode.json`) to have it in every project, or a project
`opencode.json` for one repo:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["/absolute/path/to/croupier/dist/plugin.js"]
}
```

### From npm (once published)

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["@yabbadabbadev/croupier"]
}
```

**Restart opencode** after installing or editing the config — the plugin injects
on startup and there is no hot reload. On restart it registers:

- agents `croupier-orchestrator` (primary) plus the hidden subagents
  `croupier-planner`, `croupier-test-writer`, `croupier-implementer`,
  `croupier-reviewer`, `croupier-performance` and `croupier-visual-reporter`;
- the `/croupier` command and the `croupier-workflow` skill;
- the tools `croupier_verify` and `croupier_visual_diff`;
- a `chrome-devtools` MCP server (only if you don't define one yourself).

## Quickstart

1. Write the feature spec in `docs/superpowers/specs/<feature>-design.md` with a
   `## Slices` section (see [Recipes](#recipe-a-two-slice-feature)).
2. Run `/croupier` in opencode. The orchestrator picks the active slice (from
   `progress.md`) and follows the workflow: plan → red tests → green
   implementation → `croupier_verify` gate → review → performance → visual
   report. A performance gate is optional: it becomes blocking only when a
   budget is declared, otherwise `croupier-performance` emits warnings and never
   blocks on a down app.
3. Review the slice result and answer at the gate to continue.

## Configuration

### Models per agent

No agent pins a `model`: subagents inherit the orchestrator's model, and the
orchestrator inherits your global one. To fix models per agent, add them to your
opencode config (global or project):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "croupier-orchestrator": { "model": "provider/model-id" },
    "croupier-implementer": { "model": "{env:CROUPIER_IMPL_MODEL}" }
  }
}
```

`{env:VAR}` and `{file:...}` values are supported. Restart opencode after the
change. Plugin defaults never overwrite a value you set.

### Report policy

Visual evidence goes to `docs/reports/<slice>/` (committed) or
`.croupier/reports/<slice>/` (git-ignored). The policy is one of:

- `ask` (default) — the orchestrator asks at the gate; if you don't answer, it
  falls back to `ignore` and never blocks;
- `commit` — reports are versioned under `docs/reports/`;
- `ignore` — reports stay in `.croupier/reports/`, out of git.

State it in your `/croupier` message, or edit the `croupier-workflow` skill.

### chrome-devtools MCP

The plugin adds a `chrome-devtools` local MCP server (headless) only if you
don't define one. To use your own, define `mcp["chrome-devtools"]` in your
opencode config and the plugin leaves it untouched.

### Permissions

Each subagent has a scoped permission set: `croupier-reviewer` and
`croupier-performance` are read-only (the latter with `chrome-devtools_*` for
Lighthouse), `croupier-test-writer` writes only test files, `croupier-planner`
only plans, and `croupier-visual-reporter` only report directories.
`croupier-implementer`
is the exception: its write scope (`targetFiles`) is enforced by instruction,
not by permission globs. You can override any of these in your own config.

## Recipes

### Recipe: a two-slice feature

Create `docs/superpowers/specs/2026-09-23-inline-toolbar-design.md`:

```markdown
# Design: Inline toolbar

**Goal:** Add an inline formatting toolbar to the editor.

## Slices

1. **Slice 1 — Toolbar shell and bold.**
   - Acceptance: a toolbar renders above the selection and the bold button
     toggles bold on the selected text.
   - targetFiles: `src/editor/Toolbar.tsx`, `src/editor/bold.ts`
   - UI routes: `/editor` · baseline mode: `baseline+after`
2. **Slice 2 — Italic and underline.**
   - Acceptance: italic and underline buttons work on the selection.
   - targetFiles: `src/editor/Toolbar.tsx`, `src/editor/marks.ts`
   - UI routes: `/editor`
```

Then run `/croupier`. Slice 1 is planned, implemented and stopped at the gate;
approve it and run `/croupier` again for slice 2.

### Recipe: skip the visual baseline (after-only)

For slices that don't change UI, tell the orchestrator:
`/croupier report the current visual state only, no before/after baseline`.

### Recipe: cheaper model for the test writer

```json
{
  "agent": {
    "croupier-test-writer": { "model": "provider/cheap-model" }
  }
}
```

### Recipe: change the retry budget

The default budget is 3 attempts per slice. Override it in the command:
`/croupier use a retry budget of 5 for this slice`.

### Recipe: keep or commit reports

`/croupier commit the visual reports` or `/croupier ignore the visual reports`.
With `ignore`, reports live in `.croupier/reports/` (git-ignored).

## The tools

- **`croupier_verify`** — runs `tsc --noEmit` and `vitest run --reporter=json`
  in the project directory and returns structured JSON (`passed`,
  `typeCheckPassed`, `unitTestsPassed`, `output`, `failedTestNames`).
- **`croupier_visual_diff`** — compares two PNGs (`before`, `after`) with
  `pixelmatch` and returns the differing-pixel ratio and count; optionally
  writes the diff image to `diff`.

Both run relative to the project directory (the worktree opencode runs in).

## Troubleshooting

- **The agents or `/croupier` don't appear.** You didn't restart opencode, or
  the `plugin` entry is wrong. Check the path/name and restart.
- **`croupier_verify` fails immediately.** The project must use pnpm and have
  `tsc` and `vitest` installed.
- **The visual step does nothing.** `chrome-devtools-mcp` needs `npx` and a
  reachable dev server; if the app isn't up, the reporter reports it and does
  not block the code verification.
- **My model override is ignored.** Overrides only apply if the config key
  matches the namespaced agent name (`croupier-*`) and you restarted opencode.
- **Reports pollute the repo.** Set `ignore` or `ask` (the default never commits
  without your consent).

## Development

```bash
pnpm install
pnpm test            # vitest run
pnpm run coverage    # vitest run --coverage
pnpm run typecheck   # tsc --noEmit
pnpm run build       # tsup -> dist/
pnpm run lint        # oxlint
pnpm run format      # prettier --write .
pnpm run format:check
```

Linting is **oxlint**, formatting is **prettier** — eslint is intentionally not
part of this project.

## Publishing (maintainers)

Releases flow from **merging the release PR**: `release-please` keeps a release
PR on `main` carrying the version bump and the CHANGELOG entry; merging it
creates the tag and triggers the `publish` job in
`.github/workflows/release.yml`. Publishing uses **npm trusted publishing
(OIDC)** — no `NODE_AUTH_TOKEN` is stored anywhere.

One-time manual setup:

1. On **npmjs.com**, register a trusted publisher for `@yabbadabbadev/croupier`
   with the four exact values: organization `yabbadabbadev`, repository
   `croupier`, workflow filename `release.yml`, environment `npm-publish`. All
   four fields are case-sensitive.
2. Create the **`npm-publish` GitHub environment** on this repository **with a
   required reviewer**. The workflow waits for that reviewer before running
   `npm publish`; if the environment does not exist, GitHub auto-creates it
   unprotected and the publish proceeds with no gate.
3. Enable Settings → Actions → General → "Allow GitHub Actions to create and
   approve pull requests", or release-please cannot open the release PR.

Commits on `main` follow [Conventional Commits](https://www.conventionalcommits.org/)
— `feat:`/`fix:` produce a release PR; `docs:`, `ci:`, `chore:` and `refactor:`
do not. `CHANGELOG.md` is generated by release-please.

## Links

- Roadmap and progress checklist: [`ROADMAP.md`](ROADMAP.md)
- Workflow reference and manual acceptance checklist:
  [`docs/croupier-workflow.md`](docs/croupier-workflow.md)
- Design spec:
  [`docs/superpowers/specs/2026-09-22-croupier-plugin-packaging-design.md`](docs/superpowers/specs/2026-09-22-croupier-plugin-packaging-design.md)
- License: [MIT](LICENSE)
