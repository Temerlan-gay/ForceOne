import type { Agent } from "@/game/data/agents";

/** Procedural SVG avatar for an agent (no external assets). */
export function AgentAvatar({ agent, size = 64, className }: { agent: Agent; size?: number; className?: string }) {
  const initial = agent.name.charAt(0);
  const accent = agent.hue;
  return (
    <div className={`relative shrink-0 ${className ?? ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 64 64" width={size} height={size} className="block">
        <defs>
          <linearGradient id={`g-${agent.id}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={accent} stopOpacity="0.95" />
            <stop offset="60%" stopColor={accent} stopOpacity="0.25" />
            <stop offset="100%" stopColor="#0a0e1a" />
          </linearGradient>
        </defs>
        {/* clipped polygon background */}
        <polygon points="6,2 58,2 62,8 62,58 58,62 6,62 2,58 2,8" fill={`url(#g-${agent.id})`} />
        {/* corner accents */}
        <polygon points="2,8 8,2 2,2" fill={accent} />
        <polygon points="62,56 56,62 62,62" fill={accent} />
        {/* role bar */}
        <rect x="6" y="52" width="52" height="2" fill={accent} opacity="0.85" />
      </svg>
      <div
        className="absolute inset-0 flex items-center justify-center font-black"
        style={{ fontSize: size * 0.45, color: "#fff", textShadow: `0 0 12px ${accent}` }}
      >
        {initial}
      </div>
    </div>
  );
}
