import { initI18n, t, setLang, getLang } from './i18n.js'
import { api, saveToken, clearToken, getUser } from './api.js'

const GITHUB_CLIENT_ID = 'REPLACE_WITH_CLIENT_ID'
const GITHUB_REDIRECT_URI = 'https://subs.js.org/redirect'
const GITHUB_SCOPE = 'read:org'

const EXPIRY_OPTIONS = [
  { key: 'expiry.never', value: null },
  { key: 'expiry.1h', value: 3600 },
  { key: 'expiry.6h', value: 21600 },
  { key: 'expiry.12h', value: 43200 },
  { key: 'expiry.1d', value: 86400 },
  { key: 'expiry.3d', value: 259200 },
  { key: 'expiry.7d', value: 604800 },
  { key: 'expiry.30d', value: 2592000 },
  { key: 'expiry.6m', value: 15552000 },
  { key: 'expiry.1y', value: 31536000 },
]

let state = {
  preview: null,
  selectedExpiry: null,
  saveTypes: { short: true, custom: false },
  customSlug: '',
  loading: false,
}

let debounceTimer = null

function qs(sel) { return document.querySelector(sel) }
function qsa(sel) { return document.querySelectorAll(sel) }

function updateNavUser() {
  const user = getUser()
  const loginBtn = qs('#nav-login')
  const userArea = qs('#nav-user')
  const userAvatar = qs('#nav-avatar')
  const userName = qs('#nav-username')
  if (!loginBtn || !userArea) return
  if (user) {
    loginBtn.classList.add('hidden')
    userArea.classList.remove('hidden')
    if (userAvatar) userAvatar.src = user.avatar
    if (userName) userName.textContent = user.login
  } else {
    loginBtn.classList.remove('hidden')
    userArea.classList.add('hidden')
  }
}

function startGitHubLogin() {
  const stateVal = crypto.randomUUID()
  sessionStorage.setItem('oauth_state', stateVal)
  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    redirect_uri: GITHUB_REDIRECT_URI,
    scope: GITHUB_SCOPE,
    state: stateVal,
  })
  window.location.href = `https://github.com/login/oauth/authorize?${params}`
}

async function handleOAuthCallback() {
  const params = new URLSearchParams(window.location.search)
  const code = params.get('code')
  const returnedState = params.get('state')
  const storedState = sessionStorage.getItem('oauth_state')
  if (!code) return
  if (returnedState !== storedState) {
    showError(t('auth.error.generic'))
    return
  }
  sessionStorage.removeItem('oauth_state')
  history.replaceState({}, '', window.location.pathname)
  try {
    showLoginLoading(true)
    const data = await api.loginGitHub(code)
    saveToken(data.token)
    updateNavUser()
  } catch (err) {
    const msg = err.code === 'NOT_ORG_MEMBER' ? t('auth.error.org') : t('auth.error.generic')
    showError(msg)
  } finally {
    showLoginLoading(false)
  }
}

function showLoginLoading(on) {
  const btn = qs('#nav-login')
  if (btn) btn.textContent = on ? t('auth.logging_in') : t('auth.github')
}

function showError(msg) {
  const el = qs('#error-banner')
  if (!el) return
  el.textContent = msg
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 5000)
}

function renderExpirySlider() {
  const container = qs('#expiry-options')
  if (!container) return
  container.innerHTML = ''
  EXPIRY_OPTIONS.forEach((opt, i) => {
    const btn = document.createElement('button')
    btn.className = 'expiry-btn' + (state.selectedExpiry === opt.value ? ' active' : '')
    btn.textContent = t(opt.key)
    btn.addEventListener('click', () => {
      state.selectedExpiry = opt.value
      renderExpirySlider()
    })
    container.appendChild(btn)
  })
}

function renderResults() {
  const section = qs('#results-section')
  if (!section) return
  if (!state.preview) { section.classList.add('hidden'); return }
  section.classList.remove('hidden')

  const shortUrl = qs('#result-short-url')
  const paramUrl = qs('#result-param-url')
  const existsBadge = qs('#result-exists-badge')
  if (shortUrl) shortUrl.value = state.preview.short_url
  if (paramUrl) paramUrl.value = state.preview.param_url
  if (existsBadge) {
    existsBadge.classList.toggle('hidden', !state.preview.already_exists)
  }
}

function setupCopyBtn(btnId, inputId) {
  const btn = qs(`#${btnId}`)
  const inp = qs(`#${inputId}`)
  if (!btn || !inp) return
  btn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(inp.value)
      btn.textContent = t('result.copied')
      setTimeout(() => btn.textContent = t('result.copy'), 2000)
    } catch {}
  })
}

async function doPreview(raw) {
  const statusEl = qs('#input-status')
  if (!raw.trim()) { state.preview = null; renderResults(); return }
  if (statusEl) statusEl.textContent = t('input.checking')
  try {
    state.preview = await api.preview(raw.trim())
    if (statusEl) statusEl.textContent = ''
    renderResults()
  } catch (err) {
    state.preview = null
    renderResults()
    const reasonMap = {
      INVALID_URL_FORMAT: 'input.error.invalid',
      BLOCKED_DOMAIN: 'input.error.blocked',
      IP_NOT_ALLOWED: 'input.error.ip',
      INVALID_SCHEME: 'input.error.scheme',
      INVALID_TLD: 'input.error.tld',
    }
    if (statusEl) statusEl.textContent = t(reasonMap[err.code] ?? 'input.error.generic')
  }
}

async function doSave() {
  const user = getUser()
  if (!user) { qs('#login-modal')?.classList.remove('hidden'); return }
  if (!state.preview) return

  const saveBtn = qs('#save-btn')
  if (saveBtn) saveBtn.textContent = t('save.button.saving')
  state.loading = true

  const types = []
  if (state.saveTypes.short) types.push('short')
  if (state.saveTypes.custom && state.customSlug) types.push('custom')

  const expiresAt = state.selectedExpiry
    ? Math.floor(Date.now() / 1000) + state.selectedExpiry
    : null

  try {
    await api.createLink({
      url: state.preview.original_url,
      custom_slug: state.customSlug || undefined,
      types,
      expires_at: expiresAt,
    })
    showSaveSuccess()
  } catch (err) {
    const msg = err.code === 'SLUG_TAKEN' ? t('save.error.taken') : t('save.error.generic')
    showError(msg)
  } finally {
    state.loading = false
    if (saveBtn) saveBtn.textContent = t('save.button')
  }
}

function showSaveSuccess() {
  const el = qs('#success-banner')
  if (!el) return
  el.textContent = t('save.success')
  el.classList.remove('hidden')
  setTimeout(() => el.classList.add('hidden'), 3000)
}

function setupThemeToggle() {
  const btn = qs('#theme-toggle')
  if (!btn) return
  const saved = localStorage.getItem('goto_theme') ?? 'dark'
  document.documentElement.setAttribute('data-theme', saved)
  btn.addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme')
    const next = current === 'dark' ? 'light' : 'dark'
    document.documentElement.setAttribute('data-theme', next)
    localStorage.setItem('goto_theme', next)
  })
}

function setupLangToggle() {
  const btn = qs('#lang-toggle')
  if (!btn) return
  btn.addEventListener('click', () => {
    setLang(getLang() === 'en' ? 'zh' : 'en')
    btn.textContent = getLang() === 'en' ? '中文' : 'EN'
    renderExpirySlider()
  })
  btn.textContent = getLang() === 'en' ? '中文' : 'EN'
}

async function init() {
  await initI18n()
  setupThemeToggle()
  setupLangToggle()
  updateNavUser()
  await handleOAuthCallback()

  const urlInput = qs('#url-input')
  if (urlInput) {
    urlInput.addEventListener('input', () => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => doPreview(urlInput.value), 500)
    })
  }

  qs('#paste-btn')?.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText()
      if (urlInput) { urlInput.value = text; doPreview(text) }
    } catch {}
  })

  qs('#nav-login')?.addEventListener('click', startGitHubLogin)
  qs('#nav-logout')?.addEventListener('click', () => { clearToken(); updateNavUser() })

  qs('#modal-login-btn')?.addEventListener('click', startGitHubLogin)
  qs('#modal-cancel-btn')?.addEventListener('click', () => qs('#login-modal')?.classList.add('hidden'))

  qs('#save-btn')?.addEventListener('click', doSave)

  qs('#custom-slug-input')?.addEventListener('input', e => {
    state.customSlug = e.target.value.trim()
  })

  qs('#save-short-check')?.addEventListener('change', e => { state.saveTypes.short = e.target.checked })
  qs('#save-custom-check')?.addEventListener('change', e => { state.saveTypes.custom = e.target.checked })

  setupCopyBtn('copy-short-btn', 'result-short-url')
  setupCopyBtn('copy-param-btn', 'result-param-url')

  renderExpirySlider()

  const errorParam = new URLSearchParams(window.location.search).get('error')
  if (errorParam === 'NOT_FOUND') showError(t('error.not_found'))
}

init()
