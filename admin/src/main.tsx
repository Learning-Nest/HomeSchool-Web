import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { ApiClient } from './api/client'
import { sessionStorageStore } from './api/sessionStore'
import { AuthProvider } from './auth/AuthContext'
import { config } from './config'
import { appRoutes } from './routes'
import './styles.css'

const root = createRoot(document.getElementById('root')!)

if (config.error) {
  root.render(
    <main className="login-page" id="main">
      <div className="panel panel-error" role="alert">
        <h1>Console is not configured</h1>
        <p>{config.error}</p>
        <p>Set VITE_API_BASE_URL in the admin/.env.&lt;mode&gt; file or in the build environment, then rebuild.</p>
      </div>
    </main>,
  )
} else {
  const client = new ApiClient({ baseUrl: config.apiBaseUrl, store: sessionStorageStore })
  const router = createBrowserRouter(appRoutes)
  root.render(
    <StrictMode>
      <AuthProvider client={client}>
        <RouterProvider router={router} />
      </AuthProvider>
    </StrictMode>,
  )
}
