import { useStore } from '../store'
import { shortcutHelp } from '../lib/shortcuts'
import { Modal } from './Modal'

// Lista de atalhos (Ctrl+/ ou F1), gerada da mesma tabela que o handler usa.

export function ShortcutHelp() {
  const setHelp = useStore((s) => s.setHelp)
  return (
    <Modal labelledBy="help-title" onClose={() => setHelp(false)} className="help">
      <div className="panel-title" id="help-title">
        Atalhos de teclado
      </div>
      <table className="help-table">
        <tbody>
          {shortcutHelp().map((h) => (
            <tr key={h.label}>
              <td>{h.label}</td>
              <td>
                {h.keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </td>
            </tr>
          ))}
          <tr>
            <td>Aprovar / rejeitar a alteração focada no painel</td>
            <td>
              <kbd>Alt+A</kbd> <kbd>Alt+R</kbd>
            </td>
          </tr>
          <tr>
            <td>Fechar diálogo, paleta ou prévia</td>
            <td>
              <kbd>Esc</kbd>
            </td>
          </tr>
        </tbody>
      </table>
      <p className="small muted">Atalhos com Ctrl não disparam enquanto você digita, exceto a paleta e esta ajuda. Aprovar por teclado só vale com o foco dentro do cartão de aprovação.</p>
      <div className="row-actions">
        <button className="btn" onClick={() => setHelp(false)}>
          Fechar
        </button>
      </div>
    </Modal>
  )
}
