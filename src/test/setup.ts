/**
 * Vitest setup.
 *
 * `IS_REACT_ACT_ENVIRONMENT` tells React that `act()` is legitimate here.
 * Without it React warns on every component test and, more importantly, does
 * not guarantee that updates inside `act` have flushed by the time it
 * returns — so an assertion right after a render can read the DOM as it was
 * BEFORE the render, intermittently.
 */
declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

export {}
