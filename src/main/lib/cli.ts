// Argumentos de linha de comando recusados no app instalado (H05.2). A fuse EnableNodeCliInspectArguments
// cobre o --inspect do Node; o depurador remoto do Chromium só cai com esta checagem.
const DEBUG_SWITCH = /^--(remote-debugging-(port|pipe|address)|remote-allow-origins|inspect(-brk|-port|-publish-uid)?|js-flags)(=|$)/i

export function hasDebugSwitch(argv: readonly string[]): boolean {
  return argv.some((a) => DEBUG_SWITCH.test(a))
}
