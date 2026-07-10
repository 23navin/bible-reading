"use client";

import { useEffect } from "react";

// The entry list streams in behind Suspense, so the navigation-time hash
// scroll (e.g. arriving via the home page's next-reading date link) fires
// while only the skeleton exists. Re-run it once the list has mounted.
export default function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ block: "center" });
  }, []);
  return null;
}
