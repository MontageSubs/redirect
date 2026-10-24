const STORAGE_NAMESPACE = 'redirect'

export const storageKey = (name) => `${STORAGE_NAMESPACE}:${name}`

export const STORAGE_KEYS = Object.freeze({
  token: storageKey('token'),
  lang: storageKey('lang'),
  theme: storageKey('theme'),
  oauthState: storageKey('oauth-state'),
})
