# Croupier Workflow

Workflow opencode-native por repositorio para implementar specs por slices con subagentes y verificación determinista.

Flujo por slice: plan → baseline visual (si aplica) → bucle TDD (`croupier_verify`) → review → performance → informe visual → gate humano.

## Uso

1. Reinicia opencode tras instalar/editar el workflow.
2. Escribe la spec de la feature en `docs/superpowers/specs/` con una sección `## Slices`.
3. Ejecuta `/croupier`. El orquestador elige el slice activo y sigue el flujo.
4. Revisa el resultado del slice; responde en el gate para avanzar.

## Parametrización de modelos

Ningún agente fija `model`. Por defecto, los subagentes heredan el modelo del orquestador y el orquestador el global. Para fijar modelos por agente, añade en tu `opencode.json`/`opencode.jsonc` (global o de proyecto):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "agent": {
    "croupier-orchestrator": { "model": "openrouter/deepseek/deepseek-v4.1" },
    "croupier-implementer": { "model": "{env:CROUPIER_IMPL_MODEL}" }
  }
}
```

Se admite `{env:VAR}` y `{file:...}`. Reinicia opencode tras el cambio.

## Política de reportes

`ask` (default), `commit` o `ignore`; si el humano no responde en el gate, cae a `ignore` (no bloquea). Ver la skill `croupier-workflow`.

## Checklist de aceptación manual

Requiere un proveedor configurado y un repo con dev server para la parte visual.

1. `/croupier` sobre una spec con slices: se planifica el slice y se crean tests en rojo.
2. La tool `croupier_verify` corre y devuelve JSON; con tests en verde, `passed` es `true`.
3. Con un test roto, el orquestador reintenta hasta 3 veces y luego escala.
4. Al cerrar el slice, se escribe `progress.md` y el flujo se detiene sin aprobación.
5. Con baseline, se generan `before/`, `after/`, `diff` y `report.html`; sin baseline, solo el estado actual.
6. Los `blocker` del reviewer devuelven al bucle TDD.
7. Revisar la prosa de los 7 prompts: las cinco secciones (`Rol`, `Principios`, `Criterio`, `Checklist`, `Límites`), en español, y que cada práctica cite anti-patrón y porqué.
8. Se despacha `croupier-performance`; sin budget solo emite warnings y no bloquea por caída de la app, y con budget declarado los `blocker` (LCP ≥ 2.5s / INP ≥ 200ms / CLS ≥ 0.1) vuelven al bucle TDD.
