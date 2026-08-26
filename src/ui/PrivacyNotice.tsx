/**
 * The standing statement of what galley does with a reader's work.
 *
 * This is an obligation, not decoration. Persisting the document to
 * localStorage was accepted on the condition that the on-page wording describe
 * what actually happens — an earlier "nothing is kept" would have become a lie
 * told to exactly the person the sentence exists to reassure. The claim is
 * about *transmission*, which client-side compilation makes provable, rather
 * than about retention, which it does not.
 *
 * Exported as a constant so a test can pin it: the wording drifting away from
 * the behaviour is the failure mode worth guarding against.
 */
export const PRIVACY_NOTICE =
  'Everything runs in your browser — nothing is ever sent to a server. Your work is kept in this browser so you can pick it up where you left off.'

export function PrivacyNotice() {
  return (
    <footer className="shrink-0 border-t px-4 py-1.5">
      <p className="truncate text-center text-muted-foreground text-xs">
        {PRIVACY_NOTICE}
      </p>
    </footer>
  )
}
