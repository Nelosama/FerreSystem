import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import './styles/tema.css'
import './styles/shell.css'
import './styles/plataforma.css'
import './styles/rail.css'
import './styles/admin-shell.css'
import './styles/contador.css'
import './styles/hybrid.css'
import App from './App.tsx'

// Service worker: solo en producción. Permite abrir el POS sin conexión; no cachea la API.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
