import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './ui/App'
import { ProjectorWindow } from './ui/projector/ProjectorWindow'
import './ui/app.css'

// The same app serves the projector window at …/#projector: only the picture, no controls.
const projector = window.location.hash === '#projector'

createRoot(document.getElementById('root')!).render(
  <StrictMode>{projector ? <ProjectorWindow /> : <App />}</StrictMode>,
)
