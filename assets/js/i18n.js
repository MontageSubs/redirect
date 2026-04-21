const SUPPORTED = ['en', 'zh']
const FALLBACK = 'en'

let _strings = {}
let _lang = FALLBACK

async function loadLocale(lang) {
  const base = document.head.querySelector('meta[name="base-url"]')?.content ?? ''
  const res = await fetch(`${base}/locales/${lang}.json`)
  if (!res.ok) throw new Error(`Failed to load locale: ${lang}`)
  return res.json()
}

export async function initI18n() {
  const saved = localStorage.getItem('goto_lang')
  const browser = navigator.language?.slice(0, 2).toLowerCase()
  _lang = SUPPORTED.includes(saved) ? saved : SUPPORTED.includes(browser) ? browser : FALLBACK

  try {
    _strings = await loadLocale(_lang)
  } catch {
    if (_lang !== FALLBACK) {
      _lang = FALLBACK
      _strings = await loadLocale(FALLBACK)
    }
  }

  document.documentElement.lang = _lang
  applyAll()
}

export function t(key) {
  return _strings[key] ?? key
}

export function getLang() {
  return _lang
}

export async function setLang(lang) {
  if (!SUPPORTED.includes(lang)) return
  _lang = lang
  localStorage.setItem('goto_lang', lang)
  _strings = await loadLocale(lang)
  document.documentElement.lang = lang
  applyAll()
}

function applyAll() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n')
    if (!key) return
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      el.placeholder = t(key)
    } else {
      el.textContent = t(key)
    }
  })
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'))
  })
}
