import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { supabase, supabaseConfigHint } from '@/lib/supabase'
import { cn } from '@/lib/utils'

function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-canvas">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-32 -top-40 size-[520px] rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-48 -right-24 size-[460px] rounded-full bg-violet/10 blur-3xl"
      />

      <main className="relative mx-auto flex w-full max-w-[420px] flex-1 flex-col justify-center px-4 py-10">
        <Link
          to="/"
          className="mb-7 flex items-center gap-2.5 self-center rounded-lg px-2 py-1 transition-opacity hover:opacity-80"
          aria-label="Go Academy"
        >
          <span className="grid size-10 place-items-center rounded-xl bg-gradient-to-br from-primary to-[#00758f] text-[15px] font-bold text-primary-fg shadow-[0_2px_14px_-2px_var(--primary)]">
            Go
          </span>
          <span className="text-left">
            <span className="block text-[15px] font-semibold leading-tight text-fg">Go Academy</span>
            <span className="block text-[11px] leading-tight text-fg-subtle">
              личный кабинет ученика
            </span>
          </span>
        </Link>

        <section className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-7">
          <h1 className="text-[20px] font-semibold tracking-tight text-fg">{title}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-fg-muted">{subtitle}</p>
          <div className="mt-5">{children}</div>
        </section>

        {footer ? <div className="mt-5 text-center text-[13px] text-fg-muted">{footer}</div> : null}

        <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-fg-subtle">
          <ShieldCheck className="size-3.5" />
          Аккаунт и прогресс хранятся в Supabase
        </p>
      </main>
    </div>
  )
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-danger/30 bg-danger-soft px-3 py-2 text-[13px] leading-relaxed text-danger"
    >
      {children}
    </div>
  )
}

function PasswordField({
  value,
  onChange,
  autoComplete,
  placeholder = 'Пароль',
}: {
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
}) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Lock className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
      <Input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required
        minLength={6}
        className="pl-9 pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        aria-label={visible ? 'Скрыть пароль' : 'Показать пароль'}
        className="absolute right-1.5 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-fg-subtle transition-colors hover:bg-surface-muted hover:text-fg"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function LoginPage() {
  const { signIn, resetPassword, configured } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from
  const message = (location.state as { message?: string } | null)?.message
  const [mode, setMode] = useState<'login' | 'reset'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetSent, setResetSent] = useState(false)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (mode === 'reset') {
      setSubmitting(true)
      const result = await resetPassword(email)
      setSubmitting(false)
      if (result.error) setError(result.error)
      else setResetSent(true)
      return
    }

    if (!email.trim() || !password) {
      setError('Введите email и пароль.')
      return
    }

    setSubmitting(true)
    const result = await signIn(email, password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    navigate(from && from.startsWith('/') ? from : '/', { replace: true })
  }

  if (resetSent) {
    return (
      <AuthShell
        title="Письмо отправлено"
        subtitle="Если такой email зарегистрирован, на него пришла ссылка для сброса пароля."
        footer={
          <button type="button" className="text-primary hover:underline" onClick={() => setMode('login')}>
            Вернуться ко входу
          </button>
        }
      >
        <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-fg-muted">
          Проверьте папку «Спам», если письма нет в течение пары минут.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={mode === 'login' ? 'Вход в Go Academy' : 'Сброс пароля'}
      subtitle={
        mode === 'login'
          ? 'Войдите, чтобы продолжить обучение со своего прогресса.'
          : 'Укажите email — мы отправим ссылку для создания нового пароля.'
      }
      footer={
        mode === 'login' ? (
          <>
            Нет аккаунта?{' '}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Зарегистрироваться
            </Link>
          </>
        ) : (
          <button type="button" className="text-primary hover:underline" onClick={() => setMode('login')}>
            Вернуться ко входу
          </button>
        )
      }
    >
      <form className="space-y-3.5" onSubmit={onSubmit}>
        {!configured ? <ErrorBox>{supabaseConfigHint}</ErrorBox> : null}
        {message ? (
          <div className="rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-[13px] text-success">
            {message}
          </div>
        ) : null}
        {error ? <ErrorBox>{error}</ErrorBox> : null}

        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-fg-muted">Email</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              className="pl-9"
            />
          </div>
        </label>

        {mode === 'login' ? (
          <label className="block space-y-1.5">
            <span className="flex items-center justify-between text-[12px] font-medium text-fg-muted">
              Пароль
              <button
                type="button"
                onClick={() => {
                  setMode('reset')
                  setError(null)
                }}
                className="text-[11px] font-normal text-primary hover:underline"
              >
                Забыли пароль?
              </button>
            </span>
            <PasswordField value={password} onChange={setPassword} autoComplete="current-password" />
          </label>
        ) : null}

        <Button type="submit" size="lg" className="w-full" disabled={submitting || !configured}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          {mode === 'login' ? 'Войти' : 'Отправить ссылку'}
        </Button>
      </form>
    </AuthShell>
  )
}

export function RegisterPage() {
  const { signUp, configured } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingEmail, setPendingEmail] = useState<string | null>(null)

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов.')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают.')
      return
    }

    setSubmitting(true)
    const result = await signUp(email, password)
    setSubmitting(false)
    if (result.error) {
      setError(result.error)
      return
    }
    if (result.requiresConfirmation) setPendingEmail(email.trim())
  }

  if (pendingEmail) {
    return (
      <AuthShell
        title="Проверьте почту"
        subtitle={`Мы отправили письмо на ${pendingEmail}. Перейдите по ссылке из него, чтобы подтвердить аккаунт.`}
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Вернуться ко входу
          </Link>
        }
      >
        <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-fg-muted">
          После подтверждения войдите с тем же email и паролем. Если письма нет — проверьте «Спам».
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Создать аккаунт"
      subtitle="Зарегистрируйтесь, чтобы сохранять прогресс, заметки и карточки в облаке."
      footer={
        <>
          Уже есть аккаунт?{' '}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Войти
          </Link>
        </>
      }
    >
      <form className="space-y-3.5" onSubmit={onSubmit}>
        {!configured ? <ErrorBox>{supabaseConfigHint}</ErrorBox> : null}
        {error ? <ErrorBox>{error}</ErrorBox> : null}

        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-fg-muted">Email</span>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              required
              className="pl-9"
            />
          </div>
        </label>

        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-fg-muted">Пароль</span>
          <PasswordField value={password} onChange={setPassword} autoComplete="new-password" />
        </label>

        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-fg-muted">Повторите пароль</span>
          <PasswordField
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Ещё раз"
          />
        </label>

        <Button type="submit" size="lg" className="w-full" disabled={submitting || !configured}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Зарегистрироваться
        </Button>
      </form>
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const [checking, setChecking] = useState(true)
  const [ready, setReady] = useState(false)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setReady(Boolean(data.session))
      setChecking(false)
    })
    // Ссылка из письма обрабатывается клиентом Supabase асинхронно: сессия
    // может появиться уже после первого getSession.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return
      if (session) setReady(true)
      setChecking(false)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    if (password.length < 6) {
      setError('Пароль должен содержать минимум 6 символов.')
      return
    }
    if (password !== confirm) {
      setError('Пароли не совпадают.')
      return
    }
    setSubmitting(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSubmitting(false)
    if (updateError) {
      setError('Не удалось обновить пароль. Запросите новую ссылку.')
      return
    }
    await supabase.auth.signOut()
    navigate('/login', { replace: true, state: { message: 'Пароль обновлён — войдите с новым паролем.' } })
  }

  if (checking) {
    return (
      <AuthShell title="Проверяем ссылку" subtitle="Обрабатываем ссылку для сброса пароля…">
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-fg-muted">
          <Loader2 className="size-4 animate-spin" />
          Это займёт пару секунд.
        </p>
      </AuthShell>
    )
  }

  if (!ready) {
    return (
      <AuthShell
        title="Ссылка недействительна"
        subtitle="Ссылка для сброса пароля истекла или уже была использована."
        footer={
          <Link to="/login" className="font-medium text-primary hover:underline">
            Запросить новую ссылку
          </Link>
        }
      >
        <p className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-[13px] text-fg-muted">
          Откройте страницу входа, нажмите «Забыли пароль?» и укажите email ещё раз.
        </p>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Новый пароль" subtitle="Придумайте новый пароль для входа в аккаунт.">
      <form className="space-y-3.5" onSubmit={onSubmit}>
        {error ? <ErrorBox>{error}</ErrorBox> : null}
        <label className={cn('block space-y-1.5')}>
          <span className="text-[12px] font-medium text-fg-muted">Новый пароль</span>
          <PasswordField value={password} onChange={setPassword} autoComplete="new-password" />
        </label>
        <label className="block space-y-1.5">
          <span className="text-[12px] font-medium text-fg-muted">Повторите пароль</span>
          <PasswordField
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            placeholder="Ещё раз"
          />
        </label>
        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
          Сохранить пароль
        </Button>
      </form>
    </AuthShell>
  )
}
