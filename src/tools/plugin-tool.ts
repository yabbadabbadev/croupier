export interface JsonSchemaObject {
  type: 'object'
  properties: Record<string, unknown>
  required?: string[]
  additionalProperties?: boolean
}

/**
 * Shape mínimo de una tool de plugin OpenCode 2. Es estructuralmente compatible con
 * `Tool.Info` de `@opencode/plugin`; se mantiene desacoplado del framework para no
 * arrastrar la dependencia a los tests.
 */
export interface PluginTool<Input = Record<string, unknown>> {
  name: string
  description: string
  input: JsonSchemaObject
  execute(
    input: Input,
    context?: { signal?: AbortSignal },
  ): Promise<{ content: string }>
}
