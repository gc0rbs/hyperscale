import type { ReactNode } from "react";

/**
 * Brand icon set (design/launch/65-icon-set.webp): six glyphs in a rounded-diamond frame. Ember for
 * things the player owns or burns (rig, fragment, heat), signal for things that move (overclock,
 * cooling) and for the sealed mine (lock). Stroke-only, 2px at 24, so they survive at 16px.
 */
export type IconName = "rig" | "overclock" | "cooling" | "fragment" | "heat" | "lock";

const TONE: Record<IconName, string> = {
  rig: "var(--ember)",
  overclock: "var(--signal)",
  cooling: "var(--signal)",
  fragment: "var(--ember)",
  heat: "var(--ember)",
  lock: "var(--signal)",
};

function Glyph({ name }: { name: IconName }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "rig": // isometric crate: top face + two sides with slats
      return (
        <g {...s}>
          <path d="M12 3 21 7.5v9L12 21 3 16.5v-9z" />
          <path d="M3 7.5 12 12l9-4.5M12 12v9" />
          <path d="M5.5 11.5 10 13.75M5.5 14 10 16.25" />
          <path d="M14 13.75 18.5 11.5M14 16.25 18.5 14" />
        </g>
      );
    case "overclock":
      return <path {...s} fill="currentColor" stroke="none" d="M13 2 4.5 13.5H11l-1 8.5 8.5-11.5H13z" />;
    case "cooling": // fan: hub + four blades
      return (
        <g {...s}>
          <circle cx="12" cy="12" r="2.2" />
          <path d="M12 9.8c0-4.5 2.6-6.8 5.2-6.3-1.5 2.2-2.5 4-3.2 6.1" />
          <path d="M14.2 12c4.5 0 6.8 2.6 6.3 5.2-2.2-1.5-4-2.5-6.1-3.2" />
          <path d="M12 14.2c0 4.5-2.6 6.8-5.2 6.3 1.5-2.2 2.5-4 3.2-6.1" />
          <path d="M9.8 12c-4.5 0-6.8-2.6-6.3-5.2 2.2 1.5 4 2.5 6.1 3.2" />
        </g>
      );
    case "fragment": // faceted gem
      return (
        <g {...s}>
          <path d="M7 4h10l4 5.5L12 21 3 9.5z" />
          <path d="M3 9.5h18M7 4l2.5 5.5L12 21M17 4l-2.5 5.5L12 21" />
        </g>
      );
    case "heat": // rays
      return (
        <g {...s}>
          <circle cx="12" cy="12" r="1.6" fill="currentColor" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.2 2.2M16.2 16.2l2.2 2.2M5.6 18.4l2.2-2.2M16.2 7.8l2.2-2.2" />
        </g>
      );
    case "lock":
      return (
        <g {...s}>
          <rect x="5" y="10.5" width="14" height="10" rx="1.5" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          <circle cx="12" cy="15.5" r="1.4" fill="currentColor" />
        </g>
      );
  }
}

/** Bare glyph, inherits `color`. */
export function Icon({ name, size = 20, className = "", tone }: { name: IconName; size?: number; className?: string; tone?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={{ color: tone ?? TONE[name] }} aria-hidden>
      <Glyph name={name} />
    </svg>
  );
}

/** Glyph inside the rounded-diamond frame from the icon board. */
export function FramedIcon({ name, size = 44, className = "" }: { name: IconName; size?: number; className?: string }) {
  const inner = size * 0.42;
  return (
    <span className={`relative inline-flex items-center justify-center shrink-0 ${className}`} style={{ width: size, height: size }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 44 44" className="absolute inset-0">
        <rect x="8" y="8" width="28" height="28" rx="6" transform="rotate(45 22 22)" fill="none" stroke="var(--mine-fg)" strokeWidth="2.2" />
      </svg>
      <Icon name={name} size={inner} className="relative" />
    </span>
  );
}

/** The supplied brand artwork; the viewport excludes its transparent outer padding. */
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="222 268 822 810" aria-hidden="true" focusable="false">
      <image href="/brand/stock-miner-logo.png" width="1254" height="1254" />
    </svg>
  );
}

export function Framed({ children, size = 44 }: { children: ReactNode; size?: number }) {
  return <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>{children}</span>;
}
