import { useQueryClient } from '@tanstack/react-query'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

import { supabase, supabaseConfigured, type Session, type User } from '@/lib/supabase'

type AuthResult = { error: string | null }

type RegisterResult = { error: string | null; requiresConfirmation: boolean }

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

/** Переводит типовые ошибки Supabase Auth на русский. */
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
    return 'Не удалось связаться с Supabase. Проверьте интернет и настройки проекта.'
  }
  return message
}

function errorText(error: { message: string } | null): string | null {
  return error ? authErrorMessage(error.message) : null
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const queryClient = useQueryClient()
  const lastUserID = useRef<string | null>(null)

  useEffect(() => {
    let active = true

    if (!supabaseConfigured) {
      setLoading(false)
      return
    }

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session)
      setLoading(false)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession)
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  // При смене пользователя сбрасываем кэш запросов, чтобы не показывать
  // прогресс предыдущего аккаунта.
  useEffect(() => {
    const nextID = session?.user.id ?? null
    if (lastUserID.current && lastUserID.current !== nextID) {
      queryClient.clear()
    }
    lastUserID.current = nextID
  }, [queryClient, session?.user.id])

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      configured: supabaseConfigured,
      signIn: async (email, password) => {
        if (!supabaseConfigured) return { error: 'Supabase не настроен: нет URL или anon key.' }
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        return { error: errorText(error) }
      },
      signUp: async (email, password) => {
        if (!supabaseConfigured) {
          return { error: 'Supabase не настроен: нет URL или anon key.', requiresConfirmation: false }
        }
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/login`,
          },
        })
        return {
          error: errorText(error),
          requiresConfirmation: !error && !data.session,
        }
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },
      resetPassword: async (email) => {
        if (!supabaseConfigured) return { error: 'Supabase не настроен: нет URL или anon key.' }
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        })
        return { error: errorText(error) }
      },
    }),
    [loading, session],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth должен использоваться внутри AuthProvider')
  return context
}
