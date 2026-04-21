"use client";

import { useEffect, useState } from "react";

/** True when viewport is below Tailwind `md` (< 768px). Client-only after mount. */
export function useIsMobileMd(): boolean {
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setMobile(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return mobile;
}
