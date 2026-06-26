import { useEffect, useState } from "react";
import type { Agent } from "@/game/data/agents";
import type { FPSEngine } from "@/game/fps-engine";
import type { RoundState, KillFeedEntry } from "@/game/round";
import { ROUND_CONFIG } from "@/game/round";
import { Crosshair, Skull, Timer, Trophy, ShoppingCart } from "lucide-react";

function fmt(sec: number) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Top-center round timer + score banner. */
export function RoundBanner({ round, agent }: { round: RoundState; agent: Agent }) {
  const [remaining, setRemaining] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setRemaining((round.phaseEndAt - performance.now()) / 1000), 100);
    return () => clearInterval(id);
  }, [round.phaseEndAt]);

  const phaseColor =
    round.phase === "buy"
      ? "#ffd166"
      : round.phase === "live"
        ? "var(--neon)"
        : round.phase === "end"
          ? "#ff7e5a"
          : "#a3ff7a";

  return (
    <div className="pointer-events-none absolute left-1/2 top-3 -translate-x-1/2 flex items-center gap-2 animate-fade-in">
      <ScoreChip label="YOU" value={round.score.you} side="left" hue={agent.hue} />
      <div className="bg-card/85 backdrop-blur px-5 py-2 border border-border clip-corner text-center min-w-[180px]">
        <div className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
          Round {round.round} / {ROUND_CONFIG.maxRounds}
        </div>
        <div
          className="text-2xl font-black tabular-nums leading-none mt-0.5"
          style={{ color: phaseColor }}
        >
          {fmt(remaining)}
        </div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground mt-0.5">
          {round.phase === "buy"
            ? "BUY · Подготовка"
            : round.phase === "live"
              ? "LIVE · Бой"
              : "ROUND END"}
        </div>
      </div>
      <ScoreChip label="ENEMY" value={round.score.enemy} side="right" hue="#ff4d6d" />
    </div>
  );
}

function ScoreChip({
  label,
  value,
  side,
  hue,
}: {
  label: string;
  value: number;
  side: "left" | "right";
  hue: string;
}) {
  return (
    <div
      className={`bg-card/85 backdrop-blur px-4 py-2 border border-border clip-corner ${side === "right" ? "text-left" : "text-right"}`}
      style={{ boxShadow: `inset ${side === "left" ? "-" : ""}3px 0 0 ${hue}` }}
    >
      <div className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">{label}</div>
      <div className="text-2xl font-black leading-none" style={{ color: hue }}>
        {value}
      </div>
    </div>
  );
}

/** Round-target progress (kills needed this round). */
export function RoundObjective({ round, agent }: { round: RoundState; agent: Agent }) {
  if (round.phase !== "live") return null;
  const need = ROUND_CONFIG.killTarget;
  return (
    <div className="pointer-events-none absolute left-1/2 top-24 -translate-x-1/2 flex items-center gap-1.5 bg-card/70 backdrop-blur px-3 py-1.5 border border-border text-[10px] uppercase tracking-widest animate-fade-in">
      <Crosshair className="w-3 h-3" style={{ color: agent.hue }} />
      <span className="text-muted-foreground">Цель раунда:</span>
      <span className="font-bold" style={{ color: agent.hue }}>
        {round.roundKills}/{need}
      </span>
      <span className="text-muted-foreground">киллов</span>
    </div>
  );
}

/** Kill feed on the top-right. */
export function KillFeed({ feed }: { feed: KillFeedEntry[] }) {
  return (
    <div className="pointer-events-none absolute right-4 top-20 flex flex-col gap-1 items-end">
      {feed.slice(-5).map((e) => (
        <div
          key={e.id}
          className="bg-card/80 backdrop-blur border border-border px-2.5 py-1 flex items-center gap-2 text-xs animate-fade-in clip-corner"
        >
          <span className="font-bold" style={{ color: e.hue }}>
            {e.killer}
          </span>
          <Skull className="w-3 h-3 text-muted-foreground" />
          <span className="font-bold text-foreground/90">{e.victim}</span>
          {e.headshot && (
            <span className="text-[9px] uppercase tracking-widest text-[var(--neon)]">HS</span>
          )}
        </div>
      ))}
    </div>
  );
}

/** Top-down minimap polled from the engine. */
export function Minimap({ engine, agent }: { engine: FPSEngine; agent: Agent }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 120);
    return () => clearInterval(id);
  }, []);
  void tick;

  const half = engine.getMapHalfSize();
  const size = 168;
  const player = engine.getPlayerSnapshot();
  const bots = engine.getBotSnapshots();
  const scale = size / (half * 2);
  const toPx = (v: number) => size / 2 + v * scale;

  return (
    <div
      className="pointer-events-none absolute left-4 top-20 border border-border bg-card/70 backdrop-blur clip-corner"
      style={{ width: size, height: size }}
    >
      {/* center cross */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute left-1/2 top-0 bottom-0 w-px bg-foreground" />
        <div className="absolute top-1/2 left-0 right-0 h-px bg-foreground" />
      </div>
      {/* bots */}
      {bots.map((b, i) => (
        <div
          key={i}
          className="absolute w-1.5 h-1.5 rounded-full"
          style={{
            left: toPx(b.x) - 3,
            top: toPx(b.z) - 3,
            background: b.alive ? "#ff4d6d" : "transparent",
            boxShadow: b.alive ? "0 0 6px #ff4d6d" : undefined,
            outline: !b.alive ? "1px solid rgba(255,255,255,0.2)" : undefined,
          }}
        />
      ))}
      {/* player arrow */}
      <div
        className="absolute w-3 h-3"
        style={{
          left: toPx(player.x) - 6,
          top: toPx(player.z) - 6,
          transform: `rotate(${-player.yaw}rad)`,
        }}
      >
        <div
          className="w-0 h-0"
          style={{
            borderLeft: "5px solid transparent",
            borderRight: "5px solid transparent",
            borderBottom: `9px solid ${agent.hue}`,
            filter: `drop-shadow(0 0 4px ${agent.hue})`,
          }}
        />
      </div>
      <div className="absolute bottom-1 left-2 text-[9px] uppercase tracking-widest text-muted-foreground">
        Mini-map
      </div>
    </div>
  );
}

/** Buy-phase overlay. Non-blocking — purely informational. */
export function BuyPhaseOverlay({ round, agent }: { round: RoundState; agent: Agent }) {
  const [remaining, setRemaining] = useState(ROUND_CONFIG.buySec);
  useEffect(() => {
    const id = setInterval(
      () => setRemaining(Math.max(0, (round.phaseEndAt - performance.now()) / 1000)),
      100,
    );
    return () => clearInterval(id);
  }, [round.phaseEndAt]);

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center animate-fade-in">
      <div className="absolute inset-0 bg-background/30 backdrop-blur-sm" />
      <div className="relative text-center px-10 py-8 border border-border bg-card/85 clip-corner">
        <div
          className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.4em]"
          style={{ color: agent.hue }}
        >
          <ShoppingCart className="w-3 h-3" /> Buy Phase · Round {round.round}
        </div>
        <div className="text-6xl font-black mt-2 tabular-nums" style={{ color: agent.hue }}>
          {Math.ceil(remaining)}
        </div>
        <div className="text-sm text-muted-foreground mt-3 max-w-sm">
          Изучи карту, разогрей прицел, выбери угол. Противники появятся, когда таймер обнулится.
        </div>
        <div className="mt-4 flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          <Timer className="w-3 h-3" /> WASD — двигайся · мышь — обзор · стрельба возобновится в
          LIVE
        </div>
      </div>
    </div>
  );
}

/** End-of-round banner ("ROUND WON / LOST"). */
export function RoundEndOverlay({ round }: { round: RoundState }) {
  const won = round.lastRoundResult === "won";
  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center animate-scale-in">
      <div
        className="px-12 py-6 border-y-2"
        style={{ borderColor: won ? "var(--neon)" : "#ff4d6d", background: "rgba(10,14,26,0.6)" }}
      >
        <div className="text-[11px] uppercase tracking-[0.5em] text-muted-foreground text-center">
          Round {round.round}
        </div>
        <div
          className="text-5xl font-black tracking-widest text-center"
          style={{ color: won ? "var(--neon)" : "#ff4d6d" }}
        >
          {won ? "ROUND WON" : "ROUND LOST"}
        </div>
        <div className="text-center text-xs text-muted-foreground mt-2 tabular-nums">
          {round.score.you} — {round.score.enemy}
        </div>
      </div>
    </div>
  );
}

/** Final MVP + match-result screen. */
export function MatchEndOverlay({
  round,
  agent,
  onExit,
}: {
  round: RoundState;
  agent: Agent;
  onExit: () => void;
}) {
  const won = !!round.matchWon;
  const acc =
    round.totalKills && round.totalDeaths
      ? (round.totalKills / Math.max(1, round.totalDeaths)).toFixed(2)
      : round.totalKills.toFixed(2);
  return (
    <div className="pointer-events-auto absolute inset-0 flex items-center justify-center animate-fade-in z-50">
      <div className="absolute inset-0 bg-background/85 backdrop-blur" />
      <div className="relative max-w-lg w-[90%] border border-border bg-card/90 clip-corner p-8 text-center">
        <div className="text-[10px] uppercase tracking-[0.5em] text-muted-foreground">
          Match Result
        </div>
        <div
          className="text-6xl font-black mt-2"
          style={{ color: won ? "var(--neon)" : "#ff4d6d" }}
        >
          {won ? "VICTORY" : "DEFEAT"}
        </div>
        <div className="text-2xl font-bold tabular-nums mt-2 text-foreground/90">
          {round.score.you} — {round.score.enemy}
        </div>

        <div className="mt-6 border border-border bg-background/40 p-4 clip-corner">
          <div
            className="flex items-center justify-center gap-2 text-[10px] uppercase tracking-[0.3em]"
            style={{ color: agent.hue }}
          >
            <Trophy className="w-3 h-3" /> Round MVP
          </div>
          <div className="text-2xl font-black mt-1" style={{ color: agent.hue }}>
            {agent.name}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            Best round: {round.bestRoundKills} kills
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3 mt-4">
          <Stat label="Kills" value={round.totalKills} />
          <Stat label="Deaths" value={round.totalDeaths} />
          <Stat label="K/D" value={acc} />
        </div>

        <button
          onClick={onExit}
          className="mt-6 w-full py-3 text-sm font-black uppercase tracking-[0.3em] clip-corner transition-all hover:opacity-90"
          style={{ background: agent.hue, color: "#0a0e1a", boxShadow: `0 0 24px ${agent.hue}66` }}
        >
          Покинуть матч
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="border border-border bg-background/30 p-2 clip-corner">
      <div className="text-[9px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="text-xl font-black text-foreground">{value}</div>
    </div>
  );
}
