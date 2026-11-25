import { useEffect, useState } from 'react'

const QUERY = '(prefers-color-scheme: light)'

/**
 * Tema efetivo (H06.1, ADR-020). O main fixa `nativeTheme.themeSource`, então o `prefers-color-scheme` do
 * Chromium já reflete a escolha do usuário ou o Windows (em "Sistema"). Atualiza sem recarregar.
 */
export function useTemaClaro(): boolean {
  const [claro, setClaro] = useState(() => window.matchMedia(QUERY).matches)
  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = (): void => setClaro(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return claro
}
