import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
// Ordem importa: index.css declara a ordem das camadas antes de qualquer outra regra (ADR-014).
import './styles/index.css'
import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/jetbrains-mono/wght.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/community.css'
import './styles/base.css'
import './styles/components.css'
import './styles/shell.css'
import './styles/views.css'

// Arquivo ou link arrastado para a janela não pode navegar a UI para fora do app.
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
