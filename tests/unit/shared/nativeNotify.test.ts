import { describe, expect, it } from 'vitest'
import { TIPOS_NATIVOS, deveNotificarNativo, type TipoEventoNotificavel } from '@shared/lib/nativeNotify'

const SEM_FOCO = { focada: false, visivel: true }
const MINIMIZADA = { focada: false, visivel: false }
const EM_USO = { focada: true, visivel: true }

describe('deveNotificarNativo', () => {
  it.each(TIPOS_NATIVOS)('%s: nativa sem foco ou minimizada', (tipo) => {
    expect(deveNotificarNativo(SEM_FOCO, tipo)).toBe(true)
    expect(deveNotificarNativo(MINIMIZADA, tipo)).toBe(true)
  })
  it.each(TIPOS_NATIVOS)('%s: nunca nativa com a janela em uso', (tipo) => {
    expect(deveNotificarNativo(EM_USO, tipo)).toBe(false)
  })
  it('foco com janela invisível conta como fora de vista', () => {
    expect(deveNotificarNativo({ focada: true, visivel: false }, 'aprovacao')).toBe(true)
  })
  it.each<TipoEventoNotificavel>(['erro', 'aviso', 'sucesso', 'info'])('%s nunca vira nativa', (tipo) => {
    expect(deveNotificarNativo(SEM_FOCO, tipo)).toBe(false)
    expect(deveNotificarNativo(MINIMIZADA, tipo)).toBe(false)
  })
  it('tipo fora da lista (vindo sem tipagem) é recusado', () => {
    expect(deveNotificarNativo(SEM_FOCO, 'qualquer' as TipoEventoNotificavel)).toBe(false)
  })
  it('a lista de nativos é exatamente aprovação, lembrete e conquista', () => {
    expect([...TIPOS_NATIVOS].sort()).toEqual(['aprovacao', 'conquista', 'lembrete'])
  })
})
