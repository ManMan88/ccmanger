import { describe, it, expect } from 'vitest'
import { buildApp } from '../../src/app.js'

describe('Health endpoints', () => {
  it('GET /api/health returns health status', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/health',
    })

    expect(response.statusCode).toBe(200)

    const body = JSON.parse(response.body)
    expect(body.status).toBe('ok')
    expect(body.timestamp).toBeDefined()
    expect(body.version).toBe('0.0.1')
    expect(body.checks.database).toBe(true)
  })

  it('GET /api/health/live returns ok', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/health/live',
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: 'ok' })
  })

  it('GET /api/health/ready returns ready status', async () => {
    const app = await buildApp()

    const response = await app.inject({
      method: 'GET',
      url: '/api/health/ready',
    })

    expect(response.statusCode).toBe(200)
    expect(JSON.parse(response.body)).toEqual({ status: 'ready' })
  })
})
