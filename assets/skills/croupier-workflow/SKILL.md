---
name: croupier-workflow
description: Use when implementing a spec that defines ordered slices, one slice at a time, with specialist subagents, deterministic verification, and a human approval gate between slices. Trigger on "croupier", "implement next slice", or "workflow por slices".
---

# Croupier Workflow

Procedimiento del orquestador. Un slice a la vez, con verificación determinista y gate humano.

## Entradas

- `docs/superpowers/specs/<feature>-design.md` — contiene la sección `## Slices` (lista ordenada).
- `progress.md` — ledger de estado (ver Formato).

## Antes de empezar

1. Lee la spec y localiza la sección `## Slices`.
2. Lee `progress.md` si existe; el slice activo es el primero no marcado como `approved`.
3. Si no hay slice activo y quedan slices, propónlo y confírmalo con el humano.

## Flujo por slice

1. **Plan**: despacha `croupier-planner` con el slice. El plan se escribe en `docs/superpowers/plans/`.
2. **Baseline visual** (si el slice lo indica): despacha `croupier-visual-reporter` para capturar `before/` de las rutas declaradas.
3. **Bucle TDD** (presupuesto de reintentos = 3, configurable):
   - despacha `croupier-test-writer` (fase Red),
   - despacha `croupier-implementer` (fase Green),
   - ejecuta la tool `croupier_verify` y parsea el JSON.
   - Si `passed` es `false` y quedan reintentos → vuelve al implementer con `failedTestNames` y `output`; decrementa el presupuesto.
   - Si se agota el presupuesto → **escala al humano** y detente.
4. **Review**: despacha `croupier-reviewer`. Si hay issues `blocker`, vuelven al bucle TDD con el mismo presupuesto.
5. **Performance**: despacha `croupier-performance` con el slice, `targetFiles`, rutas UI y budget opcional. Revisa el diff contra las reglas Vercel y, si la app está levantada, corre Lighthouse. Emite findings `warning` por defecto; con budget declarado, superar LCP 2.5s / INP 200ms / CLS 0.1 es `blocker`. Los `blocker` vuelven al bucle TDD con el mismo presupuesto.
6. **Informe visual**: despacha `croupier-visual-reporter` para capturar `after/`, ejecutar la tool `croupier_visual_diff` y escribir `report.html`. No bloquea si la app no está levantada; performance tampoco bloquea la verificación de código por caída de la app (reporta solo la parte de código).
7. **Cerrar el slice**: escribe `progress.md`, resume el resultado y **detente en el gate humano**.
8. **Gate humano**: no avanzas al siguiente slice sin aprobación explícita. Si el humano pide cambios, vuelve al bucle TDD.

## Política de reportes

- `ask` (default): pregunta al humano en el gate si quiere conservar/commitear; si no responde, cae a `ignore` (nunca bloquea).
- `commit`: reportes en `docs/reports/<slice>/`, versionados.
- `ignore`: reportes en `.croupier/reports/<slice>/`, no versionados.
- El informe visual no bloquea y performance tampoco bloquea por caída de la app: sin app, el performance reporta solo la revisión de código.

## Determinismo

- Los invariantes (verificación, presupuesto, gate) los ejecuta código o el orquestador siguiendo reglas, no el juicio del subagente.
- No avances nunca sin `verify` en verde y sin aprobación humana.

## Formato de `progress.md`

```markdown
# Progress — <feature>

- Slice activo: <n>
- Estado: planning | implementing | reviewing | awaiting-human | approved | escalated
- Reintentos usados: <n>/3

## Slices

- [ ] Slice 1 — <título>
- [ ] Slice 2 — <título>

## Auditoría

- <fecha> slice <n>: decisión, verificación, revisión, performance
```
