import {
  test,
  expect,
  waitForApp,
  waitForLoading,
  checkAccessibility,
} from './fixtures/test-fixtures'

test.describe('Agent Lifecycle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await waitForLoading(page)
  })

  test('should display agent boxes in worktree', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(2000)

    // Check if any agents exist
    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    // If agents exist, verify they're visible
    if (count > 0) {
      await expect(agentBoxes.first()).toBeVisible()
    }
  })

  test('should display agent status indicator', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      // Get first agent's ID from test id
      const testId = await agentBoxes.first().getAttribute('data-testid')
      const agentId = testId?.replace('agent-box-', '')

      if (agentId) {
        const statusIndicator = page.locator(`[data-testid="agent-status-${agentId}"]`)
        await expect(statusIndicator).toBeVisible()
      }
    }
  })

  test('should display agent context level', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      const testId = await agentBoxes.first().getAttribute('data-testid')
      const agentId = testId?.replace('agent-box-', '')

      if (agentId) {
        const contextIndicator = page.locator(`[data-testid="agent-context-${agentId}"]`)
        await expect(contextIndicator).toBeVisible()
        // Should contain percentage
        await expect(contextIndicator).toContainText('%')
      }
    }
  })

  test('should open agent modal when clicking on agent', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      await agentBoxes.first().click()
      // Wait for modal to open
      await expect(page.locator('[data-testid="agent-modal"]')).toBeVisible()
    }
  })

  test('should display agent mode button', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      const testId = await agentBoxes.first().getAttribute('data-testid')
      const agentId = testId?.replace('agent-box-', '')

      if (agentId) {
        const modeButton = page.locator(`[data-testid="agent-mode-${agentId}"]`)
        await expect(modeButton).toBeVisible()
      }
    }
  })

  test('should open mode dropdown on click', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      const testId = await agentBoxes.first().getAttribute('data-testid')
      const agentId = testId?.replace('agent-box-', '')

      if (agentId) {
        // Stop propagation is set, so we need to click the button specifically
        await page.click(`[data-testid="agent-mode-${agentId}"]`)
        // Check for dropdown items
        await expect(page.locator('text=Auto Approve')).toBeVisible()
        await expect(page.locator('text=Plan Mode')).toBeVisible()
        await expect(page.locator('text=Regular Mode')).toBeVisible()
      }
    }
  })

  test('should display permissions button', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      const testId = await agentBoxes.first().getAttribute('data-testid')
      const agentId = testId?.replace('agent-box-', '')

      if (agentId) {
        const permissionsButton = page.locator(`[data-testid="agent-permissions-${agentId}"]`)
        await expect(permissionsButton).toBeVisible()
      }
    }
  })

  test('should display fork button', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      const testId = await agentBoxes.first().getAttribute('data-testid')
      const agentId = testId?.replace('agent-box-', '')

      if (agentId) {
        const forkButton = page.locator(`[data-testid="agent-fork-${agentId}"]`)
        await expect(forkButton).toBeVisible()
      }
    }
  })

  test('should display delete button', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      const testId = await agentBoxes.first().getAttribute('data-testid')
      const agentId = testId?.replace('agent-box-', '')

      if (agentId) {
        const deleteButton = page.locator(`[data-testid="agent-delete-${agentId}"]`)
        await expect(deleteButton).toBeVisible()
      }
    }
  })
})

test.describe('Agent Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await waitForLoading(page)
  })

  test('should display message input in modal', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      await agentBoxes.first().click()
      await expect(page.locator('[data-testid="agent-modal"]')).toBeVisible()

      const messageInput = page.locator('[data-testid="message-input"]')
      await expect(messageInput).toBeVisible()
    }
  })

  test('should display send button in modal', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      await agentBoxes.first().click()
      await expect(page.locator('[data-testid="agent-modal"]')).toBeVisible()

      const sendButton = page.locator('[data-testid="send-button"]')
      await expect(sendButton).toBeVisible()
    }
  })

  test('should display agent tabs in modal', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      const testId = await agentBoxes.first().getAttribute('data-testid')
      const agentId = testId?.replace('agent-box-', '')

      await agentBoxes.first().click()
      await expect(page.locator('[data-testid="agent-modal"]')).toBeVisible()

      if (agentId) {
        const agentTab = page.locator(`[data-testid="agent-tab-${agentId}"]`)
        await expect(agentTab).toBeVisible()
      }
    }
  })

  test('should close modal on escape key', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      await agentBoxes.first().click()
      await expect(page.locator('[data-testid="agent-modal"]')).toBeVisible()

      await page.keyboard.press('Escape')
      await expect(page.locator('[data-testid="agent-modal"]')).not.toBeVisible()
    }
  })

  test('should pass accessibility checks in modal', async ({ page }) => {
    await page.waitForTimeout(2000)

    const agentBoxes = page.locator('[data-testid^="agent-box-"]')
    const count = await agentBoxes.count()

    if (count > 0) {
      await agentBoxes.first().click()
      await expect(page.locator('[data-testid="agent-modal"]')).toBeVisible()

      const results = await checkAccessibility(page, {
        disableRules: ['color-contrast'],
      })

      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(criticalViolations.length).toBe(0)
    }
  })
})
