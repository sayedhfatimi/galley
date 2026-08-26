import { describe, expect, it } from 'vitest'
import { PRIVACY_NOTICE } from './PrivacyNotice'

/**
 * Persisting the document to localStorage was accepted on the condition that
 * the on-page wording describe what actually happens. The wording drifting back
 * towards a retention claim galley cannot keep is the failure worth pinning:
 * the promise is about transmission, which is the one it can prove.
 */
describe('the on-page privacy notice', () => {
  it('claims nothing is transmitted, which is the provable claim', () => {
    expect(PRIVACY_NOTICE).toContain('nothing is ever sent to a server')
  })

  it('says the work is kept locally rather than claiming nothing is kept', () => {
    expect(PRIVACY_NOTICE).toContain('kept in this browser')
    expect(PRIVACY_NOTICE).not.toMatch(/nothing is kept|not saved|never stored/i)
  })
})
