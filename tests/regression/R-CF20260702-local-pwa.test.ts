import { describe, expect, it } from 'vitest'
import { shouldRegisterStoryForgeServiceWorker } from '../../src/lib/pwa/register-service-worker'

describe('CF-20260702-13 · 本地构建禁用 PWA service worker', () => {
  it('localhost / loopback 不注册 service worker，避免本地坏 SW 劫持导航', () => {
    expect(shouldRegisterStoryForgeServiceWorker('localhost')).toBe(false)
    expect(shouldRegisterStoryForgeServiceWorker('127.0.0.1')).toBe(false)
    expect(shouldRegisterStoryForgeServiceWorker('::1')).toBe(false)
    expect(shouldRegisterStoryForgeServiceWorker('[::1]')).toBe(false)
  })

  it('线上域名仍注册 service worker，保留 PWA 能力', () => {
    expect(shouldRegisterStoryForgeServiceWorker('storyforge.example.com')).toBe(true)
    expect(shouldRegisterStoryForgeServiceWorker('storyforge.vercel.app')).toBe(true)
  })
})
