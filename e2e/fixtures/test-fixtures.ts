import { test as base, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

// Extend base test with custom fixtures
export const test = base.extend<{
  axeBuilder: AxeBuilder
}>({
  axeBuilder: async ({ page }, use) => {
    const axeBuilder = new AxeBuilder({ page })
    await use(axeBuilder)
  },
})

export { expect }

// Test data factories
export const createMockWorkspace = (overrides: Record<string, unknown> = {}) => ({
  name: 'test-workspace',
  path: '/tmp/test-workspace',
  ...overrides,
})

export const createMockWorktree = (overrides: Record<string, unknown> = {}) => ({
  name: 'test-worktree',
  branch: 'feature/test',
  path: '/tmp/test-workspace/test-worktree',
  ...overrides,
})

export const createMockAgent = (overrides: Record<string, unknown> = {}) => ({
  name: 'Test Agent',
  mode: 'regular' as const,
  permissions: ['read', 'write'],
  ...overrides,
})

// Helper functions for common E2E operations
export async function waitForApp(page: import('@playwright/test').Page) {
  // Wait for the app to be fully loaded
  await page.waitForSelector('[data-testid="toolbar"]', { timeout: 30000 })
}

export async function waitForLoading(page: import('@playwright/test').Page) {
  // Wait for any loading spinners to disappear
  await page
    .locator('.animate-spin')
    .first()
    .waitFor({ state: 'hidden', timeout: 30000 })
    .catch(() => {
      // Ignore if no spinner exists
    })
}

export async function createWorkspace(page: import('@playwright/test').Page, path: string) {
  // Click workspace selector
  await page.click('[data-testid="workspace-selector"]')
  // Click open workspace
  await page.click('text=Open workspace...')
  // Handle the prompt dialog
  page.on('dialog', async (dialog) => {
    await dialog.accept(path)
  })
}

export async function addWorktree(
  page: import('@playwright/test').Page,
  name: string,
  branch: string
) {
  // Click add worktree button
  await page.click('button:has-text("Add Worktree")')
  // Fill in the form
  await page.fill('input[placeholder*="worktree"]', name)
  await page.fill('input[placeholder*="branch"]', branch)
  // Submit
  await page.click('button:has-text("Create")')
}

export async function addAgent(page: import('@playwright/test').Page, worktreeId: string) {
  // Click add agent button for the worktree
  await page.click(`[data-testid="worktree-add-agent-${worktreeId}"]`)
  await waitForLoading(page)
}

export async function openAgentModal(page: import('@playwright/test').Page, agentId: string) {
  // Click on the agent box to open modal
  await page.click(`[data-testid="agent-box-${agentId}"]`)
  // Wait for modal to open
  await page.waitForSelector('[data-testid="agent-modal"]', { state: 'visible' })
}

export async function closeAgentModal(page: import('@playwright/test').Page) {
  // Click the close button
  await page.keyboard.press('Escape')
  // Wait for modal to close
  await page.waitForSelector('[data-testid="agent-modal"]', { state: 'hidden' })
}

// Accessibility helper
export async function checkAccessibility(
  page: import('@playwright/test').Page,
  options?: { disableRules?: string[] }
) {
  const axeBuilder = new AxeBuilder({ page })

  if (options?.disableRules) {
    axeBuilder.disableRules(options.disableRules)
  }

  const results = await axeBuilder.withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()

  return results
}

// Wait for WebSocket connection
export async function waitForConnection(page: import('@playwright/test').Page) {
  await expect(page.locator('[data-testid="connection-status"]')).toContainText('Connected', {
    timeout: 10000,
  })
}
