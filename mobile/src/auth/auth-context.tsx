import type { Session, User } from '@supabase/supabase-js'
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

import { isSupabaseConfigured, getSupabase } from '@/lib/supabase'
import { clearLocalCacheOnSignOut } from '@/store/settings'

export interface AuthResult {
  error: string | null
}

export interface RegisterResult extends AuthResult {
  requiresConfirmation: boolean
}

interface AuthContextValue {
  session: Session | null
  user: User | null
  loading: boolean
  configured: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<RegisterResult>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<AuthResult>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Перевод типовых ошибок Supabase Auth — тот же набор, что в web. */
export function authErrorMessage(message: string): string {
  const lower = message.toLowerCase()
  if (lower.includes('invalid login credentials')) return 'Неверный email или пароль.'
  if (lower.includes('email not confirmed')) {
    return 'Email ещё не подтверждён. Проверьте почту и перейдите по ссылке из письма.'
  }
  if (lower.includes('user already registered')) return 'Пользователь с таким email уже зарегистрирован.'
  if (lower.includes('password should be at least')) return 'Пароль слишком короткий — минимум 6 символов.'
  if (lower.includes('unable to validate email')) return 'Некорректный email.'
  if (lower.includes('rate limit') || lower.includes('too many requests')) {
    return 'Слишком много попыток. Попробуйте через минуту.'
  }
  if (lower.includes('signups not allowed')) return 'Регистрация новых пользователей отключена.'
  if (lower.includes('fetch') || lower.includes('network')) {
    return 'Не удалось связаться с Supabase. Проверьте интернет.'
  }
  return message
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const configured = isSupabaseConfigured()

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) {
      setLoading(false)
      return
    }
    let active = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!active) return
        setSession(data.session ?? null)
        setLoading(false)
      })
      .catch(() => {
        if (active) setLoading(false)
      })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, next) => {
      if (active) setSession(next)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string): Promise<AuthResult> => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase не настроен: проверьте переменные окружения.' }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return { error: error ? authErrorMessage(error.message) : null }
  }, [])

  const signUp = useCallback(async (email: string, password: string): Promise<RegisterResult> => {
    const supabase = getSupabase()
    if (!supabase) {
      return { error: 'Supabase не настроен: проверьте переменные окружения.', requiresConfirmation: false }
    }
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password })
    return {
      error: error ? authErrorMessage(error.message) : null,
      requiresConfirmation: !error && !data.session,
    }
  }, [])

  const signOut = useCallback(async () => {
    const supabase = getSupabase()
    await supabase?.auth.signOut()
    await clearLocalCacheOnSignOut()
    setSession(null)
  }, [])

  const resetPassword = useCallback(async (email: string): Promise<AuthResult> => {
    const supabase = getSupabase()
    if (!supabase) return { error: 'Supabase не настроен: проверьте переменные окружения.' }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim())
    return { error: error ? authErrorMessage(error.message) : null }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured,
      signIn,
      signUp,
      signOut,
      resetPassword,
    }),
    [session, loading, configured, signIn, signUp, signOut, resetPassword],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth вне AuthProvider')
  return context
}
