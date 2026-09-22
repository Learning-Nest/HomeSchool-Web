import { Link } from 'react-router-dom'
import { useDocumentTitle } from '../hooks/useDocumentTitle'

export function NotFoundPage() {
  useDocumentTitle('Page not found')
  return (
    <>
      <h1>Page not found</h1>
      <p>
        There is nothing at this address. <Link to="/">Back to the dashboard</Link>.
      </p>
    </>
  )
}
