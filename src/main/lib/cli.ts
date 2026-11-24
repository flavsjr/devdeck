// Argumentos de linha de comando recusados no app instalado (H05.2). A fuse EnableNodeCliInspectArguments
// cobre o --inspect do Node; o depurador remoto do Chromium só cai com esta checagem.
// No Windows o Chromium também aceita os prefixos `-` e `/` (security review da Sprint 05).

export const DEBUG_SWITCHES = ['remote-debugging-port', 'remote-debugging-pipe', 'remote-debugging-address', 'remote-allow-origins', 'inspect', 'inspect-brk', 'inspect-port', 'inspect-publish-uid', 'js-flags']

const DEBUG_SWITCH = new RegExp(`^(--|-|/)(${DEBUG_SWITCHES.join('|')})(=|$)`, 'i')

export function hasDebugSwitch(argv: readonly string[]): boolean {
  return argv.some((a) => DEBUG_SWITCH.test(a))
}
