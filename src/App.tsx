import { useEffect, useState, type FormEvent } from 'react'
import {
  ArrowDownLeft, ArrowLeftRight, ArrowRight, ArrowUpRight, Building2, Check,
  ChevronDown, CircleHelp, Clock3, CreditCard, LayoutDashboard, LoaderCircle,
  LogOut, RefreshCw, Search, ShieldCheck, TrendingUp, Wallet, X,
} from 'lucide-react'
import { ApiError, bankApi, marketApi, type Account, type AuthResponse, type CompanyProfile, type Quote, type Transaction } from './lib/api'
import './App.css'

type AuthMode = 'login' | 'register'
const money = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const shortDate = new Intl.DateTimeFormat('es-CO', { day: '2-digit', month: 'short', year: 'numeric' })
function marketMoney(value: number, currency?: string) {
  try { return new Intl.NumberFormat('es-CO', { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 2 }).format(value) }
  catch { return money.format(value) }
}

function readSession(): AuthResponse | null {
  try {
    const saved = localStorage.getItem('bckdbank.session')
    if (!saved) return null
    const session = JSON.parse(saved) as AuthResponse
    return session.token && session.email ? session : null
  } catch { return null }
}

function App() {
  const [session, setSession] = useState<AuthResponse | null>(readSession)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [loadedDashboardKey, setLoadedDashboardKey] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const [dashboardError, setDashboardError] = useState('')
  const [authMessage, setAuthMessage] = useState('')
  const [toast, setToast] = useState('')
  const [transferOpen, setTransferOpen] = useState(false)
  const [symbol, setSymbol] = useState('AAPL')
  const [symbolInput, setSymbolInput] = useState('AAPL')
  const [quote, setQuote] = useState<Quote | null>(null)
  const [profile, setProfile] = useState<CompanyProfile | null>(null)
  const [marketError, setMarketError] = useState('')
  const [marketRetry, setMarketRetry] = useState(0)
  const [loadedMarketKey, setLoadedMarketKey] = useState('')
  const dashboardRequestKey = session ? `${session.token}:${refreshKey}` : ''
  const marketRequestKey = session ? `${session.token}:${symbol}:${marketRetry}` : ''
  const loading = Boolean(session && loadedDashboardKey !== dashboardRequestKey)
  const marketLoading = Boolean(session && loadedMarketKey !== marketRequestKey)

  useEffect(() => {
    if (!session) return
    const token = session.token
    let active = true
    async function loadDashboard() {
      try {
        const nextAccounts = await bankApi.getAccounts(token)
        const histories = await Promise.all(nextAccounts.map((account) => bankApi.getTransactions(account.accountNumber, token)))
        if (!active) return
        setAccounts(nextAccounts)
        setTransactions(histories.flat().filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).sort((left, right) => right.timestamp.localeCompare(left.timestamp)))
        setSelectedId((current) => nextAccounts.some((account) => account.id === current) ? current : (nextAccounts[0]?.id ?? null))
        setDashboardError('')
      } catch (error) {
        if (!active) return
        if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
          localStorage.removeItem('bckdbank.session')
          setSession(null)
          setAuthMessage('Tu sesión venció. Inicia sesión nuevamente.')
        } else setDashboardError(error instanceof Error ? error.message : 'No fue posible cargar tus cuentas.')
      } finally { if (active) setLoadedDashboardKey(dashboardRequestKey) }
    }
    void loadDashboard()
    return () => { active = false }
  }, [session, refreshKey, dashboardRequestKey])

  useEffect(() => {
    if (!session) return
    let active = true
    Promise.all([marketApi.getQuote(symbol), marketApi.getProfile(symbol)])
      .then(([nextQuote, nextProfile]) => {
        if (active) { setQuote(nextQuote); setProfile(nextProfile); setMarketError('') }
      })
      .catch((error: unknown) => { if (active) setMarketError(error instanceof Error ? error.message : 'No se pudo consultar Finnhub.') })
      .finally(() => { if (active) setLoadedMarketKey(marketRequestKey) })
    return () => { active = false }
  }, [session, symbol, marketRetry, marketRequestKey])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3600)
    return () => window.clearTimeout(timer)
  }, [toast])

  async function authenticate(mode: AuthMode, values: Record<string, string>) {
    setAuthMessage('')
    try {
      const next = mode === 'login'
        ? await bankApi.login(values.email, values.password)
        : await bankApi.register(values.firstName, values.lastName, values.email, values.password)
      localStorage.setItem('bckdbank.session', JSON.stringify(next))
      setSession(next)
      setToast(mode === 'register' ? 'Cuenta creada. Ya puedes comenzar.' : 'Sesión iniciada correctamente.')
    } catch (error) { setAuthMessage(error instanceof Error ? error.message : 'No fue posible iniciar sesión.') }
  }

  function logout() {
    localStorage.removeItem('bckdbank.session')
    setSession(null)
    setAccounts([])
    setTransactions([])
    setQuote(null)
    setProfile(null)
    setAuthMessage('')
  }

  function refreshDashboard() {
    setDashboardError('')
    setRefreshKey((value) => value + 1)
  }

  async function transfer(values: { sourceAccountNumber: string; destinationAccountNumber: string; amount: number; description: string }) {
    if (!session) return
    await bankApi.transfer(values, session.token)
    setTransferOpen(false)
    setDashboardError('')
    setToast('Transferencia realizada correctamente.')
    setRefreshKey((value) => value + 1)
  }

  function submitSymbol(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const normalized = symbolInput.trim().toUpperCase()
    if (normalized) setSymbol(normalized)
  }

  if (!session) return <AuthScreen onAuthenticate={authenticate} message={authMessage} />

  const selectedAccount = accounts.find((account) => account.id === selectedId) ?? accounts[0]
  const accountTransactions = selectedAccount ? transactions.filter((item) => item.sourceAccountNumber === selectedAccount.accountNumber || item.destinationAccount === selectedAccount.accountNumber) : transactions
  const totalBalance = accounts.reduce((total, account) => total + account.balance, 0)
  const isPositive = (quote?.dp ?? 0) >= 0

  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#overview" aria-label="Bckd Bank, inicio"><BrandMark /><span className="brand-name">bckd<span>bank</span></span></a>
      <div className="sidebar-label">MENÚ PRINCIPAL</div>
      <nav className="side-nav" aria-label="Navegación principal">
        <a className="nav-link is-active" href="#overview"><LayoutDashboard size={18} />Resumen</a>
        <a className="nav-link" href="#accounts"><Wallet size={18} />Mis cuentas</a>
        <a className="nav-link" href="#activity"><ArrowLeftRight size={18} />Movimientos</a>
      </nav>
      <div className="sidebar-bottom">
        <div className="secure-note"><ShieldCheck size={17} /><span>Conexión segura<br /><strong>Sesión protegida</strong></span></div>
        <button className="nav-link logout-link" onClick={logout}><LogOut size={18} />Cerrar sesión</button>
        <span className="sidebar-version">Bckd Bank · Demo</span>
      </div>
    </aside>

    <main className="main-area" id="overview">
      <header className="topbar">
        <div className="breadcrumb"><span>Área personal</span><span className="breadcrumb-slash">/</span><strong>Resumen</strong></div>
        <div className="topbar-actions"><div className="status-pill"><span className="status-dot" />Sesión segura</div><span className="avatar">{session.email.slice(0, 1).toUpperCase()}</span><span className="profile-email">{session.email}</span><button className="icon-button" onClick={logout} aria-label="Cerrar sesión" title="Cerrar sesión"><ChevronDown size={16} /></button></div>
      </header>

      <div className="content-wrap">
        {dashboardError && <div className="alert alert-error" role="alert">{dashboardError}<button onClick={refreshDashboard}><RefreshCw size={15} />Reintentar</button></div>}
        <section className="welcome-row"><div><div className="eyebrow">TU ESPACIO FINANCIERO</div><h1>Hola, {session.email.split('@')[0]?.split(/[._-]/)[0] ?? 'Usuario'}<span className="wave-mark">.</span></h1><p className="welcome-copy">Aquí tienes el estado de tus cuentas hoy.</p></div><div className="welcome-date"><Clock3 size={15} />{shortDate.format(new Date())}</div></section>

        <section className="summary-grid" aria-label="Resumen financiero">
          <article className="balance-panel"><div className="balance-panel-top"><span>Saldo total disponible · USD</span><span className="balance-chip"><Wallet size={14} />{accounts.length} {accounts.length === 1 ? 'cuenta' : 'cuentas'}</span></div><div className="balance-value">{loading ? <span className="balance-skeleton" /> : money.format(totalBalance)}</div><div className="balance-panel-bottom"><span>Consolidado de tus cuentas</span><button onClick={refreshDashboard} aria-label="Actualizar saldos" title="Actualizar saldos"><RefreshCw size={16} /></button></div><div className="balance-decoration balance-decoration-one" /><div className="balance-decoration balance-decoration-two" /></article>
          <article className="metric-panel"><div className="metric-icon metric-icon-mint"><ArrowLeftRight size={18} /></div><span className="metric-label">Movimientos registrados</span><strong className="metric-value">{loading ? '—' : transactions.length}</strong><span className="metric-footnote">En tus cuentas</span></article>
          <button className="transfer-cta" onClick={() => setTransferOpen(true)} disabled={accounts.length === 0}><span className="cta-icon"><ArrowUpRight size={20} /></span><span><strong>Transferir dinero</strong><small>Envía a otra cuenta Bckd</small></span><ArrowRight className="cta-arrow" size={18} /></button>
        </section>

        <section className="dashboard-grid">
          <div className="primary-column">
            <section className="panel accounts-panel" id="accounts"><div className="section-heading"><div><span className="eyebrow">PRODUCTOS</span><h2>Tus cuentas</h2></div><span className="section-count">{accounts.length.toString().padStart(2, '0')}</span></div>
              {loading ? <div className="loading-row"><LoaderCircle className="spin" size={20} />Cargando tus cuentas...</div> : accounts.length === 0 ? <div className="empty-state"><Wallet size={24} /><p>Aún no hay cuentas para mostrar.</p></div> : <div className="accounts-list">{accounts.map((account, index) => <button className={`account-row ${selectedAccount?.id === account.id ? 'account-row-selected' : ''}`} key={account.id} onClick={() => setSelectedId(account.id)} aria-pressed={selectedAccount?.id === account.id}><span className={`account-icon account-icon-${index % 3}`}><CreditCard size={19} /></span><span className="account-details"><strong>{account.accountType === 'SAVINGS' ? 'Cuenta de ahorros' : account.accountType}</strong><small>Cuenta {account.accountNumber}</small></span><span className="account-balance">{money.format(account.balance)}</span><ArrowRight className="account-chevron" size={16} /></button>)}</div>}
            </section>

            <section className="panel activity-panel" id="activity"><div className="section-heading activity-heading"><div><span className="eyebrow">TU CUENTA</span><h2>Actividad reciente</h2></div><span className="activity-account-label">{selectedAccount ? `•••• ${selectedAccount.accountNumber.slice(-4)}` : 'Selecciona una cuenta'}</span></div>
              {loading ? <div className="loading-row"><LoaderCircle className="spin" size={20} />Cargando movimientos...</div> : accountTransactions.length === 0 ? <div className="empty-state empty-activity"><ArrowLeftRight size={23} /><p>Tus transferencias aparecerán aquí.</p><button onClick={() => setTransferOpen(true)} disabled={!selectedAccount}>Hacer una transferencia <ArrowRight size={14} /></button></div> : <div className="transaction-list">{accountTransactions.slice(0, 6).map((transaction) => <TransactionRow key={transaction.id} transaction={transaction} outgoing={transaction.sourceAccountNumber === selectedAccount?.accountNumber} />)}</div>}
            </section>
          </div>

          <aside className="secondary-column"><section className="panel market-panel">
            <div className="market-heading"><div><span className="eyebrow">MERCADO</span><h2>En seguimiento</h2></div><span className="market-live"><span className="status-dot" />FINNHUB</span></div>
            <form className="symbol-search" onSubmit={submitSymbol}><Search size={16} /><input aria-label="Símbolo bursátil" value={symbolInput} onChange={(event) => setSymbolInput(event.target.value)} maxLength={20} placeholder="Símbolo, ej. AAPL" /><button type="submit" aria-label="Buscar símbolo" title="Buscar"><ArrowRight size={15} /></button></form>
            {marketLoading ? <div className="market-loading"><LoaderCircle className="spin" size={21} />Consultando Finnhub...</div> : marketError ? <div className="market-error" role="alert">{marketError}<button onClick={() => setMarketRetry((value) => value + 1)} aria-label="Reintentar consulta" title="Reintentar"><RefreshCw size={15} /></button></div> : quote ? <div className="quote-content">
              <div className="company-identity"><div className="company-logo">{profile?.logo ? <img src={profile.logo} alt={`${profile.name ?? symbol} logo`} /> : <Building2 size={20} />}</div><div className="company-name"><strong>{profile?.name ?? symbol}</strong><small>{profile?.exchange ?? 'Mercado'} · {profile?.ticker ?? symbol}</small></div></div>
              <div className="quote-price-row"><strong>{marketMoney(quote.c, profile?.currency)}</strong><span className={`quote-change ${isPositive ? 'positive' : 'negative'}`}>{isPositive ? '+' : ''}{quote.dp.toFixed(2)}%</span></div><div className="quote-change-detail">{isPositive ? '+' : ''}{marketMoney(quote.d, profile?.currency)} hoy</div>
              <div className="quote-divider" /><div className="quote-stats"><span><small>Máximo</small><strong>{marketMoney(quote.h, profile?.currency)}</strong></span><span><small>Mínimo</small><strong>{marketMoney(quote.l, profile?.currency)}</strong></span><span><small>Cierre anterior</small><strong>{marketMoney(quote.pc, profile?.currency)}</strong></span></div><div className="quote-source"><TrendingUp size={14} />Datos de mercado por Finnhub</div>
            </div> : <div className="market-loading">Busca un símbolo para consultar datos.</div>}
          </section><section className="security-panel"><div className="security-icon"><ShieldCheck size={19} /></div><div><strong>Tu banca, protegida</strong><p>Las operaciones se validan de forma segura.</p></div><CircleHelp className="security-help" size={16} /></section></aside>
        </section>
        <footer className="app-footer"><span>Bckd Bank · Plataforma de demostración</span><span>Cuentas en USD · Mercado según moneda de Finnhub</span></footer>
      </div>
    </main>

    {transferOpen && selectedAccount && <TransferDialog accounts={accounts} initialAccount={selectedAccount.accountNumber} onClose={() => setTransferOpen(false)} onSubmit={transfer} />}
    {toast && <div className="toast" role="status"><span className="toast-check"><Check size={15} /></span>{toast}<button onClick={() => setToast('')} aria-label="Cerrar aviso"><X size={16} /></button></div>}
  </div>
}

function BrandMark() { return <span className="brand-mark"><span /></span> }

function TransactionRow({ transaction, outgoing }: { transaction: Transaction; outgoing: boolean }) {
  const date = new Date(transaction.timestamp)
  return <div className="transaction-row"><span className={`transaction-icon ${outgoing ? 'transaction-out' : 'transaction-in'}`}>{outgoing ? <ArrowUpRight size={17} /> : <ArrowDownLeft size={17} />}</span><span className="transaction-details"><strong>{transaction.description || 'Transferencia entre cuentas'}</strong><small>{outgoing ? `Para •••• ${transaction.destinationAccount.slice(-4)}` : `De •••• ${transaction.sourceAccountNumber.slice(-4)}`}</small></span><span className="transaction-date">{Number.isNaN(date.getTime()) ? '' : shortDate.format(date)}</span><strong className={`transaction-amount ${outgoing ? 'amount-out' : 'amount-in'}`}>{outgoing ? '−' : '+'}{money.format(transaction.amount)}</strong></div>
}

function AuthScreen({ onAuthenticate, message }: { onAuthenticate: (mode: AuthMode, values: Record<string, string>) => Promise<void>; message: string }) {
  const [mode, setMode] = useState<AuthMode>('login')
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState('')
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError('')
    const values = Object.fromEntries(new FormData(event.currentTarget).entries()) as Record<string, string>
    try { await onAuthenticate(mode, values) } catch (error) { setFormError(error instanceof Error ? error.message : 'No fue posible completar la solicitud.') } finally { setBusy(false) }
  }
  return <main className="auth-page">
    <section className="auth-art" aria-label="Bckd Bank"><a className="brand brand-on-dark" href="#login"><BrandMark /><span className="brand-name">bckd<span>bank</span></span></a><div className="auth-art-copy"><span className="eyebrow">TU BANCA, A TU RITMO</span><h1>Lo importante<br />es avanzar<span>.</span></h1><p>Un espacio claro para cuidar, mover y entender tu dinero.</p></div><div className="auth-visual" aria-hidden="true"><div className="visual-orbit orbit-one" /><div className="visual-orbit orbit-two" /><div className="visual-card visual-card-back"><span className="visual-card-brand">bckd<span>bank</span></span><span className="visual-card-chip" /></div><div className="visual-card visual-card-front"><span className="visual-card-label">VISTA DE EJEMPLO</span><strong>$ 8.420,50</strong><span className="visual-card-bottom"><span>•••• 2846</span><span className="card-circles"><i /><i /></span></span></div><div className="visual-float float-arrow"><ArrowUpRight size={19} /></div><div className="visual-float float-check"><Check size={17} /></div></div><div className="auth-art-foot"><span>FINANZAS MÁS HUMANAS</span><span>01 — 03</span></div></section>
    <section className="auth-side" id="login"><div className="auth-mobile-brand"><BrandMark /><span className="brand-name">bckd<span>bank</span></span></div><div className="auth-form-wrap"><div className="auth-intro"><span className="eyebrow">ÁREA PERSONAL</span><h2>{mode === 'login' ? 'Qué bueno verte.' : 'Empecemos.'}</h2><p>{mode === 'login' ? 'Ingresa a tu espacio financiero.' : 'Crea tu acceso y abre tu primera cuenta.'}</p></div><div className="auth-tabs" role="tablist" aria-label="Acceso a la cuenta"><button className={mode === 'login' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setMode('login'); setFormError('') }} role="tab" aria-selected={mode === 'login'}>Iniciar sesión</button><button className={mode === 'register' ? 'auth-tab active' : 'auth-tab'} onClick={() => { setMode('register'); setFormError('') }} role="tab" aria-selected={mode === 'register'}>Crear cuenta</button></div>
      <form className="auth-form" onSubmit={submit}>{mode === 'register' && <div className="name-fields"><label>Nombre<input name="firstName" autoComplete="given-name" required placeholder="Tu nombre" /></label><label>Apellido<input name="lastName" autoComplete="family-name" required placeholder="Tu apellido" /></label></div>}<label>Correo electrónico<input name="email" type="email" autoComplete="email" required placeholder="nombre@correo.com" /></label><label>Contraseña<input name="password" type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={6} required placeholder={mode === 'login' ? 'Tu contraseña' : 'Mínimo 6 caracteres'} /></label>{(formError || message) && <div className="alert alert-error" role="alert">{formError || message}</div>}<button className="primary-button auth-submit" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18} /> : <>{mode === 'login' ? 'Entrar a mi cuenta' : 'Crear mi cuenta'}<ArrowRight size={17} /></>}</button></form><div className="auth-assurance"><ShieldCheck size={17} /><span>Tus datos viajan protegidos y cifrados.</span></div></div><footer className="auth-footer"><span>© 2026 Bckd Bank</span><span>Entorno de demostración</span></footer></section>
  </main>
}

function TransferDialog({ accounts, initialAccount, onClose, onSubmit }: { accounts: Account[]; initialAccount: string; onClose: () => void; onSubmit: (values: { sourceAccountNumber: string; destinationAccountNumber: string; amount: number; description: string }) => Promise<void> }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const values = { sourceAccountNumber: String(form.get('sourceAccountNumber') ?? ''), destinationAccountNumber: String(form.get('destinationAccountNumber') ?? '').trim(), amount: Number(form.get('amount')), description: String(form.get('description') ?? '').trim() }
    if (values.sourceAccountNumber === values.destinationAccountNumber) { setError('La cuenta de destino debe ser diferente a la cuenta de origen.'); return }
    setBusy(true); setError('')
    try { await onSubmit(values) } catch (submitError) { setError(submitError instanceof Error ? submitError.message : 'No fue posible realizar la transferencia.') } finally { setBusy(false) }
  }
  return <div className="dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="transfer-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-title"><div className="dialog-header"><div className="dialog-title-icon"><ArrowLeftRight size={19} /></div><button className="icon-button dialog-close" onClick={onClose} aria-label="Cerrar"><X size={19} /></button></div><span className="eyebrow">MOVIMIENTO ENTRE CUENTAS</span><h2 id="transfer-title">Nueva transferencia</h2><p className="dialog-copy">Envía dinero de forma segura a otra cuenta Bckd.</p><form className="transfer-form" onSubmit={submit}><label>Cuenta de origen<select name="sourceAccountNumber" defaultValue={initialAccount} required>{accounts.map((account) => <option key={account.id} value={account.accountNumber}>{account.accountType === 'SAVINGS' ? 'Ahorros' : account.accountType} · •••• {account.accountNumber.slice(-4)} · {money.format(account.balance)}</option>)}</select></label><label>Cuenta de destino<input name="destinationAccountNumber" required minLength={4} maxLength={30} placeholder="Número de cuenta" /></label><label>Valor a transferir<div className="amount-input"><span>$</span><input name="amount" type="number" min="0.01" step="0.01" required placeholder="0.00" /></div></label><label>Descripción <span className="optional-label">Opcional</span><input name="description" maxLength={120} placeholder="¿Cuál es el motivo?" /></label>{error && <div className="alert alert-error" role="alert">{error}</div>}<div className="dialog-actions"><button className="secondary-button" type="button" onClick={onClose}>Cancelar</button><button className="primary-button" type="submit" disabled={busy}>{busy ? <LoaderCircle className="spin" size={17} /> : <>Confirmar envío <ArrowRight size={16} /></>}</button></div></form></section></div>
}

export default App
