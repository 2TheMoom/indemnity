/**
 * The Indemnity mark: an umbrella, the literal object of protection.
 * Two gradient panels split down the canopy like real paneled fabric,
 * with a pole and a curled handle underneath. Matches the approved
 * design mockup exactly (same path data, same gradient stops).
 */

import React, { useId } from "react";

export type GlyphTone = "full" | "flat";

interface UmbrellaGlyphProps {
  size?: number;
  tone?: GlyphTone;
  className?: string;
}

export function UmbrellaGlyph({ size = 26, tone = "full", className = "" }: UmbrellaGlyphProps) {
  const uid = useId();
  const indigoId = `indigo-${uid}`;
  const amberId = `amber-${uid}`;

  if (tone === "flat") {
    return (
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
        <path d="M8 36 C8 20 20 10 32 10 L32 36 Z" fill="#5B7FC7" />
        <path d="M56 36 C56 20 44 10 32 10 L32 36 Z" fill="#D4914A" />
        <path d="M32 36 L32 52" stroke="#9AA5B2" strokeWidth="3" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" className={className}>
      <defs>
        <linearGradient id={indigoId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#7B98DA" />
          <stop offset="100%" stopColor="#44609E" />
        </linearGradient>
        <linearGradient id={amberId} x1="100%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#E8B479" />
          <stop offset="100%" stopColor="#B06E2E" />
        </linearGradient>
      </defs>
      <path d="M8 36 C8 20 20 10 32 10 L32 36 Z" fill={`url(#${indigoId})`} />
      <path d="M56 36 C56 20 44 10 32 10 L32 36 Z" fill={`url(#${amberId})`} />
      <path d="M32 10 L14 36" stroke="#2F4066" strokeWidth="1" opacity="0.4" fill="none" />
      <path d="M32 10 L50 36" stroke="#8A5A26" strokeWidth="1" opacity="0.4" fill="none" />
      <ellipse cx="20" cy="20" rx="5" ry="3" fill="#FFFFFF" opacity="0.2" transform="rotate(-35 20 20)" />
      <path d="M8 36 L56 36" stroke="#14181D" strokeWidth="2" strokeLinecap="round" />
      <path d="M32 36 L32 52" stroke="#9AA5B2" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M32 52 Q26 52 26 46" stroke="#9AA5B2" strokeWidth="2.5" fill="none" strokeLinecap="round" />
    </svg>
  );
}
