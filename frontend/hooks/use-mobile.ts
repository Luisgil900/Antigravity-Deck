import * as React from "react"

const MOBILE_BREAKPOINT = 768

/**
 * Detects if the device should use mobile sidebar behavior.
 * Returns true when:
 * 1. Screen width < 768px (portrait phone), OR
 * 2. Touch device in landscape with small viewport height (< 500px)
 *    This catches phones rotated to landscape (e.g., S24 Ultra at 915×400)
 *    but NOT tablets or laptops with touch (which have height > 500px)
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const check = () => {
      const narrowScreen = window.innerWidth < MOBILE_BREAKPOINT
      const touchLandscape =
        'ontouchstart' in window &&
        window.innerHeight < 500 &&
        window.innerWidth > window.innerHeight
      setIsMobile(narrowScreen || touchLandscape)
    }

    // Listen to both resize and orientation changes
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    mql.addEventListener("change", check)
    window.addEventListener("resize", check)
    // Also handle orientation change events (some browsers)
    if (screen.orientation) {
      screen.orientation.addEventListener("change", check)
    }

    check()

    return () => {
      mql.removeEventListener("change", check)
      window.removeEventListener("resize", check)
      if (screen.orientation) {
        screen.orientation.removeEventListener("change", check)
      }
    }
  }, [])

  return !!isMobile
}
