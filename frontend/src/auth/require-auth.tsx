import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/auth/auth-context'

function AuthLoading() {
  return (
    <div className="grid min-h-screen place-items-center bg-canvas">
      <div className="flex items-center gap-2.5 text-sm text-fg-muted">
        <span className="size-3 animate-pulse-soft rounded-full bg-primary" />
        Проверяем сессию…
      </div>
    </div>
  )
}

/** Закрывает приложение: без активной сессии отправляет на /login. */
export function RequireAuth() {
  const { session, loading } = useAuth()
  const location = useLocation()

  if (loading) return <AuthLoading />
  if (!session) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <Outlet />
}

/** Не пускает уже вошедшего пользователя на страницы входа и регистрации. */
export function PublicOnly() {
  const { session, loading } = useAuth()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from

  if (loading) return <AuthLoading />
  if (session) return <Navigate to={from && from !== '/login' ? from : '/'} replace />
  return <Outlet />
}
