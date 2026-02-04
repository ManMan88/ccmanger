---
name: test-generator
description: Generate tests following Claude Manager's testing strategy. Use when writing unit tests, integration tests, or E2E tests. Triggers on "write tests for", "add test coverage", "create unit tests", "generate integration tests", or when implementing features without tests.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# Test Generator Workflow

Generate tests following the strategy in `docs/05-testing-strategy.md`.

## Test Types

### Unit Tests (Vitest)

**Location:** `server/tests/unit/` or co-located with source files

**Pattern for Services:**
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ServiceName } from '@/services/service-name.service'

describe('ServiceName', () => {
  let service: ServiceName
  let mockDependency: MockType

  beforeEach(() => {
    mockDependency = { method: vi.fn() }
    service = new ServiceName(mockDependency)
  })

  describe('methodName', () => {
    it('should [expected behavior]', async () => {
      // Arrange
      mockDependency.method.mockResolvedValue(expected)

      // Act
      const result = await service.methodName(input)

      // Assert
      expect(result).toEqual(expected)
      expect(mockDependency.method).toHaveBeenCalledWith(input)
    })

    it('should throw [ErrorType] when [condition]', async () => {
      await expect(service.methodName(badInput))
        .rejects.toThrow(ErrorType)
    })
  })
})
```

**Pattern for Repositories:**
```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { RepositoryName } from '@/db/repositories/repository-name.repository'
import { getTestDatabase } from '../../setup'

describe('RepositoryName', () => {
  let repo: RepositoryName

  beforeEach(() => {
    const db = getTestDatabase()
    repo = new RepositoryName(db)
    // Setup test data
  })

  describe('findById', () => {
    it('should return null for non-existent id', () => {
      const result = repo.findById('nonexistent')
      expect(result).toBeNull()
    })
  })
})
```

### Integration Tests (Supertest)

**Location:** `server/tests/integration/api/`

**Pattern:**
```typescript
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { buildApp } from '@/app'
import type { FastifyInstance } from 'fastify'

describe('Resource API', () => {
  let app: FastifyInstance

  beforeAll(async () => {
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('POST /api/resources', () => {
    it('should create resource with valid data', async () => {
      const response = await request(app.server)
        .post('/api/resources')
        .send({ name: 'test' })
        .expect(201)

      expect(response.body.id).toBeDefined()
    })

    it('should return 400 for invalid data', async () => {
      await request(app.server)
        .post('/api/resources')
        .send({})
        .expect(400)
    })
  })
})
```

### Frontend Tests (Testing Library)

**Location:** Co-located as `ComponentName.test.tsx`

**Pattern:**
```typescript
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ComponentName } from './ComponentName'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } }
})

const wrapper = ({ children }) => (
  <QueryClientProvider client={queryClient}>
    {children}
  </QueryClientProvider>
)

describe('ComponentName', () => {
  it('renders correctly', () => {
    render(<ComponentName prop="value" />, { wrapper })
    expect(screen.getByText('Expected Text')).toBeInTheDocument()
  })

  it('handles user interaction', async () => {
    render(<ComponentName />, { wrapper })
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      expect(screen.getByText('Updated')).toBeInTheDocument()
    })
  })
})
```

## Coverage Requirements

| Category | Minimum | Target |
|----------|---------|--------|
| Unit Tests | 80% | 90% |
| Integration | 70% | 80% |
| Critical Paths | 95% | 100% |

## Test Generation Checklist

- [ ] Happy path tested
- [ ] Error cases tested
- [ ] Edge cases tested (empty, null, boundary values)
- [ ] Async behavior tested correctly
- [ ] Mocks cleaned up in afterEach
- [ ] No flaky tests (deterministic)
- [ ] Tests are independent (no shared state)
- [ ] Descriptive test names

## Running Tests

```bash
# All tests
npm test

# With coverage
npm run test:coverage

# Watch mode
npm run test:watch

# Specific file
npm test -- path/to/file.test.ts
```
