// Cookie-backed key/value storage: survives refresh and restarts until the user clears cookies.
// ponytail: a cookie holds ~4 KB and browsers cap expiry at 400 days, so values are split into
// numbered chunks (`key.n` = count, `key.0`…) and every save renews the expiry.
const CHUNK = 3800 // encoded chars per cookie: under the ~4096-byte limit, leaving room for name + attributes
const MAX_AGE = 400 * 24 * 60 * 60 // seconds; Chrome's maximum cookie lifetime, renewed on each save

function jar(): Map<string, string> {
  const m = new Map<string, string>()
  for (const part of document.cookie.split('; ')) {
    const i = part.indexOf('=')
    if (i > 0) m.set(part.slice(0, i), part.slice(i + 1))
  }
  return m
}

function put(name: string, value: string, maxAge = MAX_AGE) {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; SameSite=Lax${secure}`
}

/**
 * Cookie-safe and decodable by decodeURIComponent: no ';', ',', '"', '\\', spaces or non-ASCII. JSON's ':{}[]' are
 * valid cookie characters, so they stay readable instead of tripling into %XX (saved JSON shrinks by about a fifth).
 */
export const encodeCookie = (value: string) =>
  encodeURIComponent(value).replace(/%(3A|5B|5D|7B|7D)/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))

const count = (m: Map<string, string>, key: string) => {
  const n = Number(m.get(`${key}.n`))
  return Number.isInteger(n) && n > 0 ? n : 0
}

export const cookies = {
  get(key: string): string | null {
    const m = jar()
    const n = count(m, key)
    if (!n) return null
    let encoded = ''
    for (let i = 0; i < n; i++) {
      const c = m.get(`${key}.${i}`)
      if (c === undefined) return null // a lost chunk: report nothing rather than a truncated value
      encoded += c
    }
    try { return decodeURIComponent(encoded) } catch { return null }
  },

  set(key: string, value: string) {
    const old = count(jar(), key)
    const encoded = encodeCookie(value)
    const chunks = Math.max(1, Math.ceil(encoded.length / CHUNK))
    for (let i = 0; i < chunks; i++) put(`${key}.${i}`, encoded.slice(i * CHUNK, (i + 1) * CHUNK))
    put(`${key}.n`, String(chunks))
    for (let i = chunks; i < old; i++) put(`${key}.${i}`, '', 0)
  },

  remove(key: string) {
    const n = count(jar(), key)
    for (let i = 0; i < n; i++) put(`${key}.${i}`, '', 0)
    put(`${key}.n`, '', 0)
  },
}
