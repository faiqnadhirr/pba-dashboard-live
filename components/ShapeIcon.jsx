"use client";
import React from "react";
/** small SVG of a canvas marker shape for legends */
export default function ShapeIcon({ shape, c = "#55627A" }) {
  const P = { square: <rect x="2" y="2" width="8" height="8" fill={c} />, triangle: <polygon points="6,1 11,10 1,10" fill={c} />, diamond: <polygon points="6,0.5 11,6 6,11.5 1,6" fill={c} />,
    cross: <><rect x="1" y="4.2" width="10" height="3.6" fill={c} /><rect x="4.2" y="1" width="3.6" height="10" fill={c} /></>, ring: <circle cx="6" cy="6" r="4" fill="#fff" stroke={c} strokeWidth="2" />, circle: <circle cx="6" cy="6" r="4.5" fill={c} /> };
  return <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>{P[shape] || P.circle}</svg>;
}

