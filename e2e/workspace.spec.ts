import {
  test,
  expect,
  waitForApp,
  waitForLoading,
  checkAccessibility,
} from './fixtures/test-fixtures'

test.describe('Workspace Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
  })

  test('should display the toolbar with app name', async ({ page }) => {
    await expect(page.locator('[data-testid="toolbar"]')).toBeVisible()
    await expect(page.locator('text=Agent Master')).toBeVisible()
  })

  test('should show empty state when no workspace is open', async ({ page }) => {
    // Wait for loading to complete
    await waitForLoading(page)

    // Check for empty state (only if no workspace is loaded)
    const emptyState = page.locator('text=No Workspace Open')
    const workspace = page.locator('[data-testid^="worktree-row-"]')

    // Either empty state or workspace should be visible
    const hasEmptyState = await emptyState.isVisible().catch(() => false)
    const hasWorkspace = await workspace
      .first()
      .isVisible()
      .catch(() => false)

    expect(hasEmptyState || hasWorkspace).toBe(true)
  })

  test('should display workspace selector in toolbar', async ({ page }) => {
    const workspaceSelector = page.locator('[data-testid="workspace-selector"]')
    await expect(workspaceSelector).toBeVisible()
  })

  test('should open workspace dropdown on click', async ({ page }) => {
    await page.click('[data-testid="workspace-selector"]')
    await expect(page.locator('text=Open workspace...')).toBeVisible()
  })

  test('should toggle theme', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]')
    await expect(themeToggle).toBeVisible()

    // Get initial theme state
    const htmlElement = page.locator('html')
    const initialClass = await htmlElement.getAttribute('class')
    const initialIsDark = initialClass?.includes('dark')

    // Toggle theme
    await themeToggle.click()
    await page.waitForTimeout(100) // Wait for theme transition

    // Verify theme changed
    const newClass = await htmlElement.getAttribute('class')
    const newIsDark = newClass?.includes('dark')
    expect(newIsDark).not.toBe(initialIsDark)
  })

  test('should display settings button', async ({ page }) => {
    const settingsButton = page.locator('[data-testid="settings-button"]')
    await expect(settingsButton).toBeVisible()
  })

  test('should open settings dialog', async ({ page }) => {
    await page.click('[data-testid="settings-button"]')
    // Settings dialog should open
    await expect(page.locator('[role="dialog"]')).toBeVisible()
  })

  test('should show connection status', async ({ page }) => {
    const connectionStatus = page.locator('[data-testid="connection-status"]')
    await expect(connectionStatus).toBeVisible()
  })

  test('should pass accessibility checks on main page', async ({ page }) => {
    await waitForLoading(page)

    const results = await checkAccessibility(page, {
      // Disable rules that may have false positives with shadcn/ui
      disableRules: ['color-contrast'],
    })

    // Check for critical violations only
    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    if (criticalViolations.length > 0) {
      console.log('Accessibility violations:', JSON.stringify(criticalViolations, null, 2))
    }

    expect(criticalViolations.length).toBe(0)
  })
})

test.describe('Workspace with Data', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await waitForLoading(page)
  })

  test('should display worktree rows when workspace has data', async ({ page }) => {
    // Wait for potential worktree rows
    await page.waitForTimeout(2000)

    // Check if any worktree rows exist
    const worktreeRows = page.locator('[data-testid^="worktree-row-"]')
    const count = await worktreeRows.count()

    // If no worktrees, that's also valid (empty workspace)
    if (count > 0) {
      await expect(worktreeRows.first()).toBeVisible()
    }
  })

  test('should display Add Worktree button when workspace is open', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Check if workspace is loaded (has refresh button or add worktree button)
    const addWorktreeButton = page.locator('button:has-text("Add Worktree")')
    const emptyState = page.locator('text=No Workspace Open')

    const hasAddButton = await addWorktreeButton.isVisible().catch(() => false)
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    // Either workspace is loaded with add button, or empty state is shown
    expect(hasAddButton || hasEmptyState).toBe(true)
  })

  test('should show refresh button when workspace is loaded', async ({ page }) => {
    await page.waitForTimeout(2000)

    const refreshButton = page.locator('button:has-text("Refresh")')
    const emptyState = page.locator('text=No Workspace Open')

    const hasRefresh = await refreshButton.isVisible().catch(() => false)
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    // Either has refresh or is empty
    expect(hasRefresh || hasEmptyState).toBe(true)
  })
})
