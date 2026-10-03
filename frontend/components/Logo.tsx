/**
 * Indemnity Logo Component
 *
 * An umbrella - the literal object of protection, split into two
 * gradient panels (indigo and amber) like real paneled fabric.
 */

import React from "react";
import { UmbrellaGlyph } from "./UmbrellaGlyph";

export type LogoVariant = "full" | "mark" | "wordmark";
export type LogoSize = "sm" | "md" | "lg";

interface LogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
}

const sizeMap = {
  sm: 22,
  md: 28,
  lg: 36,
};

function Mark({ size }: { size: number }) {
  return (
    <span className="shrink-0 inline-flex" aria-label="Indemnity">
      <UmbrellaGlyph size={size} />
    </span>
  );
}

export function Logo({ variant = "full", size = "md", className = "" }: LogoProps) {
  const markSize = sizeMap[size];

  const Wordmark = () => (
    <div className="leading-none">
      <span className="font-head text-foreground" style={{ fontSize: "1.2rem" }}>
        Indemnity
      </span>
      <div className="mt-0.5 font-mono text-[0.58rem] text-muted-foreground" style={{ letterSpacing: "0.08em" }}>
        Parametric Insurance Exchange
      </div>
    </div>
  );

  if (variant === "mark") {
    return <div className={`inline-flex items-center ${className}`}><Mark size={markSize} /></div>;
  }
  if (variant === "wordmark") {
    return <div className={`inline-flex items-center ${className}`}><Wordmark /></div>;
  }
  return (
    <div className={`inline-flex items-center gap-2.5 ${className}`}>
      <Mark size={markSize} />
      <Wordmark />
    </div>
  );
}

export function LogoFull(props: Omit<LogoProps, "variant">) {
  return <Logo {...props} variant="full" />;
}

export function LogoMark(props: Omit<LogoProps, "variant">) {
  return <Logo {...props} variant="mark" />;
}

export function LogoWordmark(props: Omit<LogoProps, "variant">) {
  return <Logo {...props} variant="wordmark" />;
}
