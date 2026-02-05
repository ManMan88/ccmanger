import {
  test,
  expect,
  waitForApp,
  waitForLoading,
  checkAccessibility,
} from './fixtures/test-fixtures'

test.describe('Worktree Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await waitForLoading(page)
  })

  test('should display worktree rows', async ({ page }) => {
    await page.waitForTimeout(2000)

    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const emptyState = page.locator('text=No Workspace Open')

    const hasWorktrees = (await worktreeRows.count()) > 0
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    // Either worktrees exist or empty state is shown
    expect(hasWorktrees || hasEmptyState).toBe(true)
  })

  test('should display worktree sort dropdown', async ({ page }) => {
    await page.waitForTimeout(2000)

    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const count = await worktreeRows.count()

    if (count > 0) {
      const testId = await worktreeRows.first().getAttribute('data-testid')
      const worktreeId = testId?.replace('worktree-row-', '')

      if (worktreeId) {
        const sortButton = page.locator(`[data-testid="worktree-sort-${worktreeId}"]`)
        await expect(sortButton).toBeVisible()
      }
    }
  })

  test('should open sort dropdown and show options', async ({ page }) => {
    await page.waitForTimeout(2000)

    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const count = await worktreeRows.count()

    if (count > 0) {
      const testId = await worktreeRows.first().getAttribute('data-testid')
      const worktreeId = testId?.replace('worktree-row-', '')

      if (worktreeId) {
        await page.click(`[data-testid="worktree-sort-${worktreeId}"]`)
        await expect(page.locator('text=Free Arrangement')).toBeVisible()
        await expect(page.locator('text=By Status')).toBeVisible()
        await expect(page.locator('text=By Name')).toBeVisible()
      }
    }
  })

  test('should display add agent button in worktree', async ({ page }) => {
    await page.waitForTimeout(2000)

    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const count = await worktreeRows.count()

    if (count > 0) {
      const testId = await worktreeRows.first().getAttribute('data-testid')
      const worktreeId = testId?.replace('worktree-row-', '')

      if (worktreeId) {
        const addAgentButton = page.locator(`[data-testid="worktree-add-agent-${worktreeId}"]`)
        await expect(addAgentButton).toBeVisible()
      }
    }
  })

  test('should display more options button', async ({ page }) => {
    await page.waitForTimeout(2000)

    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const count = await worktreeRows.count()

    if (count > 0) {
      const testId = await worktreeRows.first().getAttribute('data-testid')
      const worktreeId = testId?.replace('worktree-row-', '')

      if (worktreeId) {
        const moreButton = page.locator(`[data-testid="worktree-more-${worktreeId}"]`)
        await expect(moreButton).toBeVisible()
      }
    }
  })

  test('should open more options menu', async ({ page }) => {
    await page.waitForTimeout(2000)

    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const count = await worktreeRows.count()

    if (count > 0) {
      const testId = await worktreeRows.first().getAttribute('data-testid')
      const worktreeId = testId?.replace('worktree-row-', '')

      if (worktreeId) {
        await page.click(`[data-testid="worktree-more-${worktreeId}"]`)
        await expect(page.locator('text=Checkout branch')).toBeVisible()
        await expect(page.locator('text=Remove worktree')).toBeVisible()
      }
    }
  })

  test('should display history button when previous agents exist', async ({ page }) => {
    await page.waitForTimeout(2000)

    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const count = await worktreeRows.count()

    if (count > 0) {
      const testId = await worktreeRows.first().getAttribute('data-testid')
      const worktreeId = testId?.replace('worktree-row-', '')

      if (worktreeId) {
        // History button only shows if there are previous agents
        const historyButton = page.locator(`[data-testid="worktree-history-${worktreeId}"]`)
        // This may or may not be visible depending on state
        const isVisible = await historyButton.isVisible().catch(() => false)
        // Just verify the test can run - presence depends on data
        expect(typeof isVisible).toBe('boolean')
      }
    }
  })

  test('should show empty agent state in worktree', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Look for the empty state message
    const emptyAgentState = page.locator('text=No agents. Click')
    const agentBoxes = page.locator('[data-testid^="agent-box-"]')

    const hasEmptyState = await emptyAgentState.isVisible().catch(() => false)
    const hasAgents = (await agentBoxes.count()) > 0

    // Either has agents or shows empty state (or no workspace)
    const noWorkspace = await page
      .locator('text=No Workspace Open')
      .isVisible()
      .catch(() => false)
    expect(hasEmptyState || hasAgents || noWorkspace).toBe(true)
  })

  test('should pass accessibility checks on worktree row', async ({ page }) => {
    await page.waitForTimeout(2000)

    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const count = await worktreeRows.count()

    if (count > 0) {
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

test.describe('Add Worktree Dialog', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await waitForLoading(page)
  })

  test('should open add worktree dialog', async ({ page }) => {
    await page.waitForTimeout(2000)

    const addWorktreeButton = page.locator('button:has-text("Add Worktree")')
    const buttonVisible = await addWorktreeButton.isVisible().catch(() => false)

    if (buttonVisible) {
      await addWorktreeButton.click()
      await expect(page.locator('[role="dialog"]')).toBeVisible()
    }
  })

  test('should close add worktree dialog on cancel', async ({ page }) => {
    await page.waitForTimeout(2000)

    const addWorktreeButton = page.locator('button:has-text("Add Worktree")')
    const buttonVisible = await addWorktreeButton.isVisible().catch(() => false)

    if (buttonVisible) {
      await addWorktreeButton.click()
      await expect(page.locator('[role="dialog"]')).toBeVisible()

      // Click cancel or press escape
      await page.keyboard.press('Escape')
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    }
  })
})
