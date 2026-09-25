# Roadmap

Visión y hoja de ruta del proyecto **croupier**: un workflow de desarrollo
orquestado por agentes que vive dentro de opencode.

## Visión

Un agente **orquestador** + **subagentes especialistas**, declarados en opencode,
que implementan una spec por **slices**, con verificación determinista, evidencia
visual, y un **gate humano** entre slices. La spec y los planes se producen con
las skills de superpowers; el contexto, las skills, los MCP y el modelo los
aporta opencode.

Principio rector: **el determinismo para los invariantes, el juicio del agente
para lo demás**. Los checks duros (verificación, presupuesto de reintentos, gate)
son código o reglas; los subagentes deciden el contenido.

## Estado (checklist)

Marca lo hecho. Cada subsistema sigue su propio ciclo: brainstorming → spec →
plan → ejecución por subagentes.

- [x] **1. Empaquetado como plugin opencode.**
      `@yabbadabbadev/croupier` es un plugin que inyecta el roster, el comando
      `/croupier`, la skill `croupier-workflow` y el MCP `chrome-devtools`, y
      registra las tools `croupier_verify` y `croupier_visual_diff`. El
      CLI-harness retirado se eliminó. Publicación preparada (release-please +
      OIDC) pero **aún sin publicar en npm**.
      Spec: `docs/superpowers/specs/2026-09-22-croupier-plugin-packaging-design.md`.
- [ ] **2. Robustecer los agentes.** Leer las skills de Vercel
      (`vercel-react-best-practices`, `vercel-composition-patterns`,
      `vercel-react-view-transitions`, `web-design-guidelines`) y reescribir el
      orquestador y los subagentes para frontend real y moderno, aplicando buenas
      prácticas de la industria. Incluye el pendiente transversal A.
- [ ] **3. Feature flags (XP).** Un subagente que detecte si un slice necesita
      feature flag, proponga proteger el cambio con una flag, y que pueda hablar
      con un MCP de un servicio de flags (p. ej. Unleash).
- [ ] **4. Observabilidad.** Un subagente de Sentry + su MCP, integrado en el loop
      (comprobar que el cambio no introduce errores nuevos).
- [ ] **5. Compatibilidad cross-browser.** Un subagente que infiera el target
      (AGENTS.md, docs de referencia, config del bundler/`tsconfig`/browserslist)
      y asegure que el JS/CSS producido es compatible: elija soluciones
      cross-browser o proponga polyfills/shims. Investigar MDN
      (`@mdn/browser-compat-data`) vs caniuse (`caniuse-lite`); para CSS,
      `doiuse` (postcss). **Nada de eslint** (`eslint-plugin-compat` descartado).

## Pendientes transversales

- [ ] **A. test-writer: globs incompletos.** `assets/agents/croupier-test-writer.md`
      permite `**/*.spec.ts`, `**/*.test.ts` y `tests/**`, pero **no**
      `.tsx`/`.jsx`/`.js` ni `**/__tests__/**`. En frontend React lo habitual es
      `Component.test.tsx`, que hoy quedaría denegado. Ampliar los globs.
- [ ] **B. `progress.md` por feature.** Hoy el ledger es un `progress.md` suelto en
      la raíz del proyecto; con varias features colisionaría. Moverlo a un path
      por feature (p. ej. `docs/superpowers/specs/<feature>.progress.md`) y
      actualizar la skill `croupier-workflow`.
- [ ] **ARCHITECTURE_SPEC.md obsoleto.** Sigue describiendo el CLI-harness
      retirado. Reescribir o eliminar (está en el historial de git).
- [ ] **Publicación npm.** Configurar en npmjs el _trusted publisher_ de
      `yabbadabbadev/croupier` (repo, workflow `release.yml`, environment
      `npm-publish`) y crear ese environment en GitHub con reviewer requerido.
      Mientras no se publique, la instalación es por **ruta local** al
      `dist/plugin.js` (ver README).

## Convenciones del proyecto

- **Nada de eslint**: lint con **oxlint**, formato con **prettier**.
- Agentes con prefijo **`croupier-`**; subagentes `hidden`. Ningún agente fija
  `model` (los subagentes heredan el del orquestador; el usuario puede fijarlos).
- Los **assets** (`assets/agents`, `assets/skills`, `assets/commands`) son la
  fuente de verdad; el plugin los inyecta y **no pisa** la config del usuario.
- El plugin resuelve su `assetsDir` relativo a su propio módulo.
- Commits en `main` con **Conventional Commits** (release-please).
- Tras cambiar config de opencode, **reiniciar opencode**.

## Cómo retomar

Una sesión fresca puede arrancar sin contexto previo:

1. Leer este `ROADMAP.md` y las specs en `docs/superpowers/specs/`.
2. Empezar por el **subsistema 2** con la skill de brainstorming.
3. Recordar las convenciones de arriba y los pendientes transversales.

Specs y planes relevantes:

- `docs/superpowers/specs/2026-09-22-croupier-opencode-workflow-design.md`
- `docs/superpowers/specs/2026-09-22-croupier-plugin-packaging-design.md`
- `docs/superpowers/plans/2026-09-22-croupier-plugin-packaging.md`
- `docs/croupier-workflow.md` (referencia del workflow)
