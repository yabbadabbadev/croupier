import type { CommandContribution } from './config-contribution.js'

export interface CommandInvocation {
  sessionID: string
  prompt: { text: string } & Record<string, unknown>
  delivery: 'steer' | 'queue'
}

/** Subconjunto del cliente de sesión que usa el comando. */
export interface SessionClient {
  switchAgent(input: { sessionID: string; agent: string }): Promise<void>
  prompt(
    input: Record<string, unknown> & {
      sessionID: string
      text: string
      delivery: 'steer' | 'queue'
    },
  ): Promise<void>
}

export type CommandExecute = (invocation: CommandInvocation) => Promise<void>

/**
 * Expande un template de comando (mismo contrato que los comandos markdown de OpenCode):
 * `$ARGUMENTS` → texto completo; `$1..$n` → posicionales; sin placeholder → añade los
 * argumentos tras una línea en blanco.
 */
export function expandTemplate(template: string, args: string): string {
  if (template.includes('$ARGUMENTS')) {
    return template.replaceAll('$ARGUMENTS', args)
  }
  if (/\$\d+/.test(template)) {
    const parts = args.trim().length > 0 ? args.trim().split(/\s+/) : []
    return template.replace(/\$(\d+)/g, (_, n: string) => parts[Number(n) - 1] ?? '')
  }
  return args.trim().length > 0 ? `${template}\n\n${args}` : template
}

/**
 * En OpenCode 2 los comandos de plugin son programáticos: `execute` recibe un ÚNICO
 * argumento (la invocación); el cliente de sesión se captura aquí desde `setup`. Reproduce
 * el `assets/commands/croupier.md` seleccionando su agente y enviando el prompt expandido,
 * conservando el resto de campos del prompt (adjuntos, skills, etc.).
 */
export function makeCommandExecute(
  command: CommandContribution,
  session: SessionClient,
): CommandExecute {
  return async (invocation) => {
    await session.switchAgent({
      sessionID: invocation.sessionID,
      agent: command.agent,
    })
    await session.prompt({
      ...invocation.prompt,
      sessionID: invocation.sessionID,
      text: expandTemplate(command.template, invocation.prompt.text),
      delivery: invocation.delivery,
    })
  }
}
