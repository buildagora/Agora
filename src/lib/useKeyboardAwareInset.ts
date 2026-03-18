"use client";

import { useState, useEffect, useRef } from "react";

/**
 * Hook to calculate bottom inset for fixed composer on iOS Safari.
 * 
 * Returns the distance from the bottom of the layout viewport to the bottom
 * of the visual viewport. This accounts for:
 * - Keyboard height
 * - Safari bottom toolbar/URL pill
 * - Safe area insets
 * 
 * The composer should use: transform: translateY(-${bottomInsetPx}px)
 * to lift above the keyboard and browser UI.
 */
export function useKeyboardAwareInset(): number {
  const [bottomInsetPx, setBottomInsetPx] = useState(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const updateInset = () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }

      rafRef.current = requestAnimationFrame(() => {
        if (window.visualViewport) {
          const vv = window.visualViewport;
          // Distance from bottom of layout viewport to bottom of visual viewport
          // This includes keyboard height + browser UI changes
          const inset = Math.max(0, window.innerHeight - (vv.height + vv.offsetTop));
          setBottomInsetPx(inset);
        } else {
          setBottomInsetPx(0);
        }
      });
    };

    // Set initial inset
    updateInset();

    // Update on visual viewport resize (keyboard open/close)
    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateInset);
      window.visualViewport.addEventListener("scroll", updateInset);
    }

    // Update on window resize (fallback)
    window.addEventListener("resize", updateInset);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateInset);
        window.visualViewport.removeEventListener("scroll", updateInset);
      }
      window.removeEventListener("resize", updateInset);
    };
  }, []);

  return bottomInsetPx;
}



