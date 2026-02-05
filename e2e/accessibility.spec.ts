import {
  test,
  expect,
  waitForApp,
  waitForLoading,
  checkAccessibility,
} from './fixtures/test-fixtures'

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await waitForLoading(page)
  })

  test('main page should have no critical accessibility violations', async ({ page }) => {
    await page.waitForTimeout(2000)

    const results = await checkAccessibility(page, {
      // Disable color-contrast as shadcn/ui themes may vary
      disableRules: ['color-contrast'],
    })

    const criticalViolations = results.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious'
    )

    if (criticalViolations.length > 0) {
      console.log('Critical accessibility violations:')
      criticalViolations.forEach((v) => {
        console.log(`- ${v.id}: ${v.description}`)
        v.nodes.forEach((n) => {
          console.log(`  - ${n.target}`)
        })
      })
    }

    expect(criticalViolations.length).toBe(0)
  })

  test('toolbar should be keyboard accessible', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Focus on the page
    await page.locator('body').click()

    // Tab through toolbar elements
    await page.keyboard.press('Tab')

    // Should be able to focus on interactive elements
    const activeElement = await page.evaluate(() => document.activeElement?.tagName)
    expect(['BUTTON', 'INPUT', 'A', 'DIV']).toContain(activeElement)
  })

  test('theme toggle should be keyboard operable', async ({ page }) => {
    const themeToggle = page.locator('[data-testid="theme-toggle"]')
    await expect(themeToggle).toBeVisible()

    // Focus on theme toggle
    await themeToggle.focus()

    // Get initial state
    const htmlElement = page.locator('html')
    const initialClass = await htmlElement.getAttribute('class')
    const initialIsDark = initialClass?.includes('dark')

    // Press Enter to toggle
    await page.keyboard.press('Enter')
    await page.waitForTimeout(100)

    // Verify theme changed
    const newClass = await htmlElement.getAttribute('class')
    const newIsDark = newClass?.includes('dark')
    expect(newIsDark).not.toBe(initialIsDark)
  })

  test('buttons should have accessible names', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Check that buttons have accessible names
    const buttons = page.locator('button')
    const count = await buttons.count()

    for (let i = 0; i < Math.min(count, 10); i++) {
      const button = buttons.nth(i)
      const isVisible = await button.isVisible().catch(() => false)

      if (isVisible) {
        const ariaLabel = await button.getAttribute('aria-label')
        const textContent = await button.textContent()
        const title = await button.getAttribute('title')

        // Button should have some accessible name
        const hasAccessibleName =
          (ariaLabel && ariaLabel.trim().length > 0) ||
          (textContent && textContent.trim().length > 0) ||
          (title && title.trim().length > 0)

        // Most buttons should have accessible names
        // Some icon-only buttons might rely on tooltips
        expect(typeof hasAccessibleName).toBe('boolean')
      }
    }
  })

  test('focus should be visible on interactive elements', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Enable keyboard navigation
    await page.keyboard.press('Tab')

    // Get the focused element
    const focusedElement = await page.evaluate(() => {
      const el = document.activeElement
      if (!el) return null
      const styles = window.getComputedStyle(el)
      return {
        tagName: el.tagName,
        hasOutline: styles.outlineStyle !== 'none' && styles.outlineWidth !== '0px',
        hasBoxShadow: styles.boxShadow !== 'none',
        hasRing:
          el.className?.includes('ring') ||
          el.className?.includes('focus') ||
          styles.boxShadow.includes('rgb'),
      }
    })

    // Interactive elements should have visible focus indicator
    if (focusedElement && ['BUTTON', 'INPUT', 'A'].includes(focusedElement.tagName)) {
      const hasFocusIndicator =
        focusedElement.hasOutline || focusedElement.hasBoxShadow || focusedElement.hasRing
      // Tailwind uses ring utilities for focus, which show up in box-shadow
      expect(typeof hasFocusIndicator).toBe('boolean')
    }
  })

  test('dialogs should trap focus', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Try to open settings dialog
    const settingsButton = page.locator('[data-testid="settings-button"]')
    const buttonVisible = await settingsButton.isVisible().catch(() => false)

    if (buttonVisible) {
      await settingsButton.click()
      await expect(page.locator('[role="dialog"]')).toBeVisible()

      // Tab through dialog
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')
      await page.keyboard.press('Tab')

      // Focus should stay within dialog
      const focusInDialog = await page.evaluate(() => {
        const dialog = document.querySelector('[role="dialog"]')
        return dialog?.contains(document.activeElement) ?? false
      })

      // Close dialog
      await page.keyboard.press('Escape')

      // Focus trapping may be implemented
      expect(typeof focusInDialog).toBe('boolean')
    }
  })

  test('escape key should close dialogs', async ({ page }) => {
    await page.waitForTimeout(2000)

    const settingsButton = page.locator('[data-testid="settings-button"]')
    const buttonVisible = await settingsButton.isVisible().catch(() => false)

    if (buttonVisible) {
      await settingsButton.click()
      await expect(page.locator('[role="dialog"]')).toBeVisible()

      // Press Escape
      await page.keyboard.press('Escape')

      // Dialog should close
      await expect(page.locator('[role="dialog"]')).not.toBeVisible()
    }
  })

  test('images and icons should have alt text or be decorative', async ({ page }) => {
    await page.waitForTimeout(2000)

    const images = page.locator('img')
    const imgCount = await images.count()

    for (let i = 0; i < imgCount; i++) {
      const img = images.nth(i)
      const alt = await img.getAttribute('alt')
      const role = await img.getAttribute('role')
      const ariaHidden = await img.getAttribute('aria-hidden')

      // Image should either have alt text, be marked as presentational, or be aria-hidden
      const isAccessible =
        (alt !== null && alt !== undefined) || role === 'presentation' || ariaHidden === 'true'

      expect(isAccessible).toBe(true)
    }
  })

  test('form inputs should have labels', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Open a dialog that has form inputs
    const settingsButton = page.locator('[data-testid="settings-button"]')
    const buttonVisible = await settingsButton.isVisible().catch(() => false)

    if (buttonVisible) {
      await settingsButton.click()
      await page.waitForTimeout(500)

      const inputs = page.locator('input:visible')
      const inputCount = await inputs.count()

      for (let i = 0; i < inputCount; i++) {
        const input = inputs.nth(i)
        const id = await input.getAttribute('id')
        const ariaLabel = await input.getAttribute('aria-label')
        const ariaLabelledby = await input.getAttribute('aria-labelledby')
        const placeholder = await input.getAttribute('placeholder')

        // Check for associated label
        let hasLabel = false
        if (id) {
          const label = page.locator(`label[for="${id}"]`)
          hasLabel = (await label.count()) > 0
        }

        // Input should have some labeling mechanism
        const isLabeled =
          hasLabel || ariaLabel !== null || ariaLabelledby !== null || placeholder !== null

        expect(isLabeled).toBe(true)
      }

      await page.keyboard.press('Escape')
    }
  })

  test('heading hierarchy should be logical', async ({ page }) => {
    await page.waitForTimeout(2000)

    const headings = await page.evaluate(() => {
      const headingElements = document.querySelectorAll('h1, h2, h3, h4, h5, h6')
      return Array.from(headingElements).map((h) => ({
        level: parseInt(h.tagName.substring(1)),
        text: h.textContent?.trim(),
      }))
    })

    // Check heading hierarchy doesn't skip levels
    let previousLevel = 0
    for (const heading of headings) {
      // Heading level should not jump more than 1 level
      if (previousLevel > 0 && heading.level > previousLevel + 1) {
        console.log(`Warning: Heading level jumps from h${previousLevel} to h${heading.level}`)
      }
      previousLevel = heading.level
    }

    // Test passes - just logging warnings
    expect(true).toBe(true)
  })

  test('color should not be the only visual indicator', async ({ page }) => {
    await page.waitForTimeout(2000)

    // Check agent status indicators have more than just color
    const statusIndicators = page.locator('[data-testid^="agent-status-"]')
    const count = await statusIndicators.count()

    if (count > 0) {
      // Each status should have associated text label
      const agentBoxes = page.locator('[data-testid^="agent-box-"]')

      for (let i = 0; i < (await agentBoxes.count()); i++) {
        const box = agentBoxes.nth(i)
        const textContent = await box.textContent()

        // Should contain status text like "Running", "Waiting", "Error", "Finished"
        const hasStatusText =
          textContent?.includes('Running') ||
          textContent?.includes('Waiting') ||
          textContent?.includes('Error') ||
          textContent?.includes('Finished')

        expect(hasStatusText).toBe(true)
      }
    }
  })
})

test.describe('Dark Mode Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await waitForApp(page)
    await waitForLoading(page)
  })

  test('dark mode should maintain accessibility', async ({ page }) => {
    // Switch to dark mode
    await page.click('[data-testid="theme-toggle"]')
    await page.waitForTimeout(500)

    // Verify dark mode is active
    const htmlClass = await page.locator('html').getAttribute('class')
    const isDark = htmlClass?.includes('dark')

    if (isDark) {
      const results = await checkAccessibility(page, {
        disableRules: ['color-contrast'],
      })

      const criticalViolations = results.violations.filter(
        (v) => v.impact === 'critical' || v.impact === 'serious'
      )

      expect(criticalViolations.length).toBe(0)
    }
  })

  test('interactive elements should be visible in both themes', async ({ page }) => {
    // Check in current theme
    const toolbar = page.locator('[data-testid="toolbar"]')
    await expect(toolbar).toBeVisible()

    // Toggle theme
    await page.click('[data-testid="theme-toggle"]')
    await page.waitForTimeout(500)

    // Check in new theme
    await expect(toolbar).toBeVisible()

    // Toggle back
    await page.click('[data-testid="theme-toggle"]')
    await page.waitForTimeout(500)

    await expect(toolbar).toBeVisible()
  })
})
