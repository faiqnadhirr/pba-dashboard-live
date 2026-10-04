"use client";
// URL-driven navigation shared by every component: view, filters, site-list preset (sel) and language live in the URL,
// so any link can be shared / bookmarked and the browser Back button works.
import React, { createContext, useContext } from "react";

export const NavCtx = createContext({ navigate: () => {}, hrefFor: () => "#", state: {} });
export const useNav = () => useContext(NavCtx);

/** <Go to={{ view: "mbp.placement", nop: "NOP BATAM" }}> — a real link (middle-click / copy works) that navigates in-app */
export function Go({ to, children, className = "text-s1 underline hover:text-navy", title, onBefore }) {
  const { navigate, hrefFor } = useNav();
  return (
    <a href={hrefFor(to)} title={title} className={className}
      onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; e.preventDefault(); e.stopPropagation(); onBefore?.(); navigate(to); }}>{children}</a>
  );
}
