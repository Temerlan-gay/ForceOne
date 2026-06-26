import type { Agent } from "@/game/data/agents";

/** Procedural SVG avatar for an agent (no external assets). */
export function AgentAvatar({
  agent,
  size = 64,
  className,
}: {
  agent: Agent;
  size?: number;
  className?: string;
}) {
  const initial = agent.name.charAt(0);
  const accent = agent.hue;
  const dark = "#080b13";
  const roleShape =
    agent.role === "Duelist"
      ? "M33 8 47 28 34 56 18 32Z"
      : agent.role === "Controller"
        ? "M15 23C24 7 44 10 49 27c4 14-8 26-23 23C12 48 7 35 15 23Z"
        : agent.role === "Sentinel"
          ? "M32 7 51 15v16c0 13-8 21-19 26C21 52 13 44 13 31V15Z"
          : "M12 33c7-14 20-22 40-24-3 18-12 31-27 40l-2-12Z";

  return (
    <div className={`relative shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} className="block">
        <defs>
          <linearGradient id={`g-${agent.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
            <stop offset="48%" stopColor={accent} stopOpacity="0.28" />
            <stop offset="100%" stopColor={dark} />
          </linearGradient>
          <radialGradient id={`r-${agent.id}`} cx="50%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.42" />
            <stop offset="45%" stopColor={accent} stopOpacity="0.2" />
            <stop offset="100%" stopColor={dark} stopOpacity="0.1" />
          </radialGradient>
          <filter id={`glow-${agent.id}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="2.2" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <polygon
          points="7,2 57,2 62,8 62,57 57,62 7,62 2,57 2,8"
          fill={`url(#g-${agent.id})`}
        />
        <polygon points="7,2 57,2 62,8 62,57 57,62 7,62 2,57 2,8" fill={`url(#r-${agent.id})`} />
        <path d={roleShape} fill={accent} opacity="0.18" filter={`url(#glow-${agent.id})`} />
        <path d={roleShape} fill="none" stroke={accent} strokeOpacity="0.7" strokeWidth="1.2" />
        <circle cx="32" cy="25" r="10.5" fill={dark} opacity="0.88" />
        <path
          d="M17 52c2.4-10.5 9.1-16 15-16s12.6 5.5 15 16"
          fill={dark}
          opacity="0.9"
        />
        <path d="M23 25h18" stroke={accent} strokeWidth="3.2" strokeLinecap="round" />
        <path d="M11 11h12M41 53h12" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        <path d="M7 45V25M57 19v20" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1" />
        <rect x="7" y="55" width="50" height="2" fill={accent} opacity="0.8" />
      </svg>
      <div
        className="absolute inset-x-0 bottom-[14%] flex items-center justify-center font-black"
        style={{ fontSize: size * 0.24, color: "#fff", textShadow: `0 0 12px ${accent}` }}
      >
        {initial}
      </div>
    </div>
  );
}
