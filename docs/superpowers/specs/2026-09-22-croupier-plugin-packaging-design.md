# Design: Croupier como plugin opencode — Empaquetado y distribución

**Fecha:** 2026-09-22
**Estado:** Aprobado en brainstorming, pendiente de plan de implementación
**Ámbito:** Subsistema 1 de 4. Convierte el workflow croupier en un **plugin opencode** instalable globalmente y publicable en npm, sin copiar ficheros por proyecto.

---

## 1. Contexto y problema

El workflow croupier ya existe como ficheros sueltos (`.opencode/agent/*`, `.opencode/skill/`, `.opencode/command/`, `.opencode/opencode.json`, `scripts/*.mjs`). Para usarlo en un proyecto hay que **copiar** esos ficheros, añadir devDependencies y ajustar rutas. Eso no es sostenible proyecto a proyecto.

Se necesita empaquetarlo de forma que viva en el opencode **global** del usuario, se instale una sola vez y sea publicable en npm cuando esté sólido.

## 2. Objetivo y no-objetivos

**Objetivo**

- Un paquete npm que exporta un **plugin opencode** que inyecta agentes, comando, skill y MCP, y registra tools deterministas.
- Instalación única (global o npm), **cero copia por proyecto**.
- Estructura lista para publicar en npm; arranca en local/global.
- Validar la viabilidad de la inyección de config con un **spike** antes de construir todo.

**No-objetivos**

- Robustecer los prompts de los agentes (subsistema 2).
- Feature flags (subsistema 3) y observabilidad/Sentry (subsistema 4); el plugin solo debe dejar sitio para sus MCP.
- Publicar realmente en npm (se prepara; el publish es un paso manual posterior).

## 3. Decisión y rationale

Se adopta el **enfoque C**: plugin que lo inyecta todo, con estructura de npm desde el principio, arrancando en local/global y publicando después.

- Un único artefacto (el plugin) aporta **todo** el workflow.
- El hook `config(cfg)` de opencode permite mutar la config fusionada; `AgentConfig` admite `prompt`, `mode`, `hidden`, `permission`, `description`, `temperature`. Confirmado en el esquema oficial.
- Los scripts deterministas pasan a ser **custom tools** del plugin, lo que elimina las rutas repo-relative.

Alternativas descartadas: **plugin de tools + assets copiados** (dos mecanismos, no es un install único) y **seguir con copia por proyecto** (el problema actual).

## 4. Estructura del paquete

```
package.json                 # type module; exports "." → dist/plugin.js
                             # deps: @opencode-ai/plugin, yaml, pixelmatch, pngjs
                             # devDeps: tsup, vitest, typescript
src/plugin.ts                # exporta el Plugin (hook config + registro de tools)
src/config-contribution.ts   # función PURA buildConfigContribution(pkgDir)
src/tools/verify.ts          # tool croupier_verify
src/tools/visual-diff.ts     # tool croupier_visual_diff
assets/agents/*.md           # roster (fuente de verdad editable)
assets/skills/croupier-workflow/SKILL.md
assets/commands/croupier.md
tests/                       # unit tests
```

`package.json` expone el plugin como export principal. El paquete se compila con `tsup` a `dist/`.

## 5. Comportamiento del plugin

`src/plugin.ts` exporta un `Plugin` que, en el hook `config(cfg)`, aplica `buildConfigContribution(pkgDir)`:

- **Agentes**: lee `assets/agents/*.md`, parsea frontmatter y registra `cfg.agent[name]` con `prompt` = body. **No pisa** claves ya presentes en la config del usuario (merge conservador por agente: los valores del usuario ganan).
- **Comando**: añade `cfg.command["croupier"]` si no existe.
- **Skills**: añade la carpeta `assets/skills` a `cfg.skills.paths` si no está ya.
- **MCP**: añade los servidores necesarios (chrome-devtools ahora; Sentry/Unleash en subsistemas 3–4) solo si no están ya definidos.
- **Tools**: registra `croupier_verify` y `croupier_visual_diff`. Corren en el directorio del proyecto (`context.directory`/`worktree`). `croupier_verify` ejecuta `tsc --noEmit` + `vitest run --reporter=json`; `croupier_visual_diff` hace el diff de píxeles.

`buildConfigContribution(pkgDir)` es **pura** (recibe el directorio del paquete, devuelve la contribución) para poder testearla sin runtime de opencode.

## 6. Instalación y distribución

- **Local/global:** `plugin: ["./ruta/al/plugin"]` o copiar a `~/.config/opencode/plugins/`.
- **npm:** `plugin: ["@yabbadabbadev/croupier"]` en la config global.
- Tras instalar o cambiar la config, **reiniciar opencode** (no hay hot-reload).
- El paquete se publica con `prepublishOnly` (typecheck + test + build).

## 7. Spike de validación (primera tarea del plan)

Antes de construir el paquete completo: un plugin mínimo que
1. inyecte **un** agente vía `config(cfg)`,
2. registre **una** tool,
3. añada **una** skill a `cfg.skills.paths`.

El humano reinicia opencode y confirma que el agente, la tool y la skill aparecen. Si la inyección no funciona como se espera, se replantea el enfoque antes de seguir.

## 8. Estrategia de tests

- Unit test de `buildConfigContribution`: inyecta agentes/comando/skills/MCP y **preserva los overrides del usuario**.
- Unit test de las tools, reutilizando la lógica determinista ya probada (verify/visual-diff).
- El spike (§7) cubre la validación de runtime, que no es automatizable sin reiniciar opencode.

## 9. Retirada del CLI-harness

El código del CLI-harness retirado (`src/cli`, `src/graph`, `src/nodes`, `src/arbiter`, `src/state`) se **elimina** del paquete. Queda recuperable en el historial de git. El paquete pasa a ser el plugin, no el CLI.

## 10. Relación con los subsiguientes subsistemas

- **2 (robustecer agentes):** cambia el contenido de `assets/agents` y la skill; no cambia el empaquetado.
- **3 (feature flags) y 4 (observabilidad):** añaden agentes y servidores MCP; el plugin ya contempla inyectar MCP y agentes adicionales.

## 11. Criterios de aceptación

1. El paquete exporta un plugin válido que compila con `tsup`.
2. `buildConfigContribution` inyecta agentes, comando, skill y MCP, y **no pisa** overrides del usuario (test).
3. Las tools `croupier_verify` y `croupier_visual_diff` funcionan y están testeadas.
4. El spike confirma que opencode carga lo inyectado tras reiniciar.
5. El código del CLI-harness retirado ya no está en el paquete.
6. `pnpm run typecheck`, `pnpm test` y `pnpm run build` en verde.
7. La estructura permite publicar en npm sin cambios (exports, `files`, `prepublishOnly`).

## 12. Decisiones abiertas

- Nombre definitivo del export del plugin y de las tools (por ahora `croupier_verify`, `croupier_visual_diff`).
- Si el plugin añade el MCP de chrome-devtools por defecto o de forma opt-in.
- Formato de los assets (markdown con frontmatter vs manifiesto JSON); por ahora markdown + `yaml`.