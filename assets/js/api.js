const BASE = 'https://link.go-to.workers.dev/api/v1'

function getToken() {
  return localStorage.getItem('goto_token')
}

function authHeaders() {
  const token = getToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)
  const res = await fetch(`${BASE}${path}`, opts)
  const data = await res.json()
  if (!data.success) throw Object.assign(new Error(data.message ?? 'Request failed'), { code: data.code, status: res.status })
  return data.data
}

export const api = {
  preview(url) {
    return request('GET', `/preview?url=${encodeURIComponent(url)}`)
  },

  loginGitHub(code) {
    return request('POST', '/auth/github', { code })
  },

  createLink(payload) {
    return request('POST', '/links', payload)
  },

  listLinks(page = 1) {
    return request('GET', `/links?page=${page}`)
  },

  deleteLink(slug) {
    return request('DELETE', `/links/${slug}`)
  },

  patchLink(slug, payload) {
    return request('PATCH', `/links/${slug}`, payload)
  },

  health() {
    return request('GET', '/health')
  },
}

export function saveToken(token) {
  localStorage.setItem('goto_token', token)
}

export function clearToken() {
  localStorage.removeItem('goto_token')
}

export function getUser() {
  const token = getToken()
  if (!token) return null
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    if (payload.exp < Math.floor(Date.now() / 1000)) { clearToken(); return null }
    return payload
  } catch {
    return null
  }
}
