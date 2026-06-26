import { useEffect, useMemo, useState } from "react";
import { AGENTS, ROLE_DETAILS, type Agent, type AgentRole } from "@/game/data/agents";
import { MAPS, type GameMap } from "@/game/data/maps";
import { AgentPreview3D } from "@/game/AgentPreview3D";
import { AgentAvatar } from "@/game/AgentAvatar";
import { playAgentLine, prefetchAgentLines } from "@/game/voice";
import {
  Lock,
  ArrowLeft,
  Loader2,
  Volume2,
  MapPin,
  Crosshair,
  CloudFog,
  Shield,
  Radar,
  Bomb,
  Sparkles,
  Footprints,
  Crown,
} from "lucide-react";

const ROLES: (AgentRole | "All")[] = ["All", "Duelist", "Controller", "Sentinel", "Initiator"];
const ROLE_ICON = { Duelist: Crosshair, Controller: CloudFog, Sentinel: Shield, Initiator: Radar };

type Phase = "map" | "agent";

/** Valorant-style flow: show the rolled map for a beat, then go to agent select. */
export function AgentSelect({
  map,
  initialAgent,
  onLockIn,
  onBack,
}: {
  map: GameMap;
  initialAgent: Agent;
  onLockIn: (agent: Agent) => void;
  onBack: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("map");
  const [agent, setAgent] = useState<Agent>(initialAgent);
  const [countdown, setCountdown] = useState(3);
  const [locked, setLocked] = useState(false);
  const [roleFilter, setRoleFilter] = useState<AgentRole | "All">("All");

  const roster = useMemo(
    () => (roleFilter === "All" ? AGENTS : AGENTS.filter((a) => a.role === roleFilter)),
    [roleFilter],
  );
  const roleInfo = ROLE_DETAILS[agent.role];
  const RoleIcon = ROLE_ICON[agent.role];

  // Auto-transition map -> agent select after a short reveal
  useEffect(() => {
    if (phase !== "map") return;
    const t = setTimeout(() => setPhase("agent"), 2200);
    return () => clearTimeout(t);
  }, [phase]);

  // Countdown after lock-in
  useEffect(() => {
    if (!locked) return;
    if (countdown <= 0) {
      onLockIn(agent);
      return;
    }
    const t = setTimeout(() => setCountdown((c) => c - 1), 800);
    return () => clearTimeout(t);
  }, [locked, countdown, agent, onLockIn]);

  // Prefetch voice lines for the focused agent
  useEffect(() => {
    prefetchAgentLines(agent);
  }, [agent]);

  if (phase === "map") return <MapReveal map={map} />;

  return (
    <div className="fixed inset-0 bg-background text-foreground flex flex-col overflow-hidden">
      {/* Backdrop tinted with agent + map */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute inset-0" style={{ background: map.preview, opacity: 0.18 }} />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
        <div
          className="absolute -inset-40 blur-[160px] opacity-30"
          style={{
            background: `radial-gradient(circle at 30% 50%, ${agent.hue}, transparent 60%)`,
          }}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 border-b border-border bg-sidebar/70 backdrop-blur px-6 h-14 flex items-center justify-between">
        <button
          onClick={onBack}
          disabled={locked}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30"
        >
          <ArrowLeft className="w-4 h-4" />{" "}
          <span className="uppercase tracking-widest text-xs font-bold">Назад</span>
        </button>
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Agent Select
          </div>
          <div className="text-sm font-black uppercase tracking-widest">
            Карта: <span className="text-[var(--neon)]">{map.name}</span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Lock in
          </div>
          <div
            className={`text-sm font-black ${locked ? "text-[var(--neon)]" : "text-muted-foreground"}`}
          >
            {locked ? `${countdown}` : "—"}
          </div>
        </div>
      </header>

      {/* Body — left list, center preview, right details */}
      <div className="relative z-10 flex-1 grid grid-cols-12 gap-4 p-4 min-h-0">
        {/* Roster list */}
        <aside className="col-span-3 flex flex-col min-h-0">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2 px-1">
            Roster · {roster.length}/{AGENTS.length}
          </div>
          <div className="grid grid-cols-2 gap-1.5 mb-3">
            {ROLES.map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                disabled={locked}
                className={`px-2 py-2 text-[10px] uppercase tracking-widest border transition-all flex items-center justify-center gap-1.5 ${
                  roleFilter === r
                    ? "border-[var(--neon)] text-[var(--neon)] bg-card/80"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-card/40"
                }`}
              >
                {r === "All" ? (
                  "Все"
                ) : (
                  <>
                    {(() => {
                      const Icon = ROLE_ICON[r];
                      return <Icon className="w-3 h-3" />;
                    })()}
                    {ROLE_DETAILS[r].label}
                  </>
                )}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto pr-1 space-y-1.5 flex-1">
            {roster.map((a) => {
              const sel = a.id === agent.id;
              return (
                <button
                  key={a.id}
                  onClick={() => {
                    if (locked) return;
                    setAgent(a);
                  }}
                  disabled={locked}
                  className={`w-full flex items-center gap-3 p-2 border transition-all clip-corner text-left ${
                    sel
                      ? "border-[var(--neon)] bg-card/80"
                      : "border-border bg-card/30 hover:bg-card/60"
                  }`}
                  style={
                    sel
                      ? { boxShadow: `0 0 0 1px ${a.hue}55 inset, 0 0 20px ${a.hue}33` }
                      : undefined
                  }
                >
                  <AgentAvatar agent={a} size={44} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold uppercase tracking-wider truncate">
                      {a.name}
                    </div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                      {(() => {
                        const Icon = ROLE_ICON[a.role];
                        return <Icon className="w-3 h-3" style={{ color: a.hue }} />;
                      })()}
                      {ROLE_DETAILS[a.role].label}
                    </div>
                  </div>
                  {sel && (
                    <div
                      className="w-1.5 h-8"
                      style={{ background: a.hue, boxShadow: `0 0 10px ${a.hue}` }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </aside>

        {/* Preview */}
        <section className="col-span-6 flex flex-col min-h-0">
          <div className="relative flex-1 border border-border bg-card/30 clip-corner overflow-hidden">
            <AgentPreview3D key={agent.id} agent={agent} className="absolute inset-0" />
            {/* Big watermark name */}
            <div className="absolute inset-0 flex items-end pointer-events-none">
              <div className="px-8 pb-8 w-full">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  <RoleIcon className="w-3.5 h-3.5" style={{ color: agent.hue }} />
                  {roleInfo.label}
                </div>
                <div
                  className="text-6xl md:text-7xl font-black tracking-tight leading-none"
                  style={{ textShadow: `0 0 24px ${agent.hue}66` }}
                >
                  {agent.name.toUpperCase()}
                </div>
                <div className="text-sm text-muted-foreground mt-2 max-w-md">{agent.tagline}</div>
                <div className="mt-4 max-w-xl border-l-2 pl-4" style={{ borderColor: agent.hue }}>
                  <div className="text-xs text-foreground/85">{roleInfo.combatStyle}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">
                    {roleInfo.specialty}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Details + lock-in */}
        <aside className="col-span-3 flex flex-col gap-3 min-h-0 overflow-y-auto">
          <div className="border border-border bg-card/50 backdrop-blur p-4 clip-corner">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
              Identity
            </div>
            <div className="text-sm font-bold">{agent.lore.realName}</div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
              <MapPin className="w-3 h-3" /> {agent.lore.origin}
            </div>
            <p className="text-xs text-foreground/80 leading-relaxed mt-2">{agent.lore.bio}</p>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-3">
              Personality
            </div>
            <div className="text-xs" style={{ color: agent.hue }}>
              {agent.lore.personality}
            </div>
          </div>

          <div className="border border-border bg-card/50 backdrop-blur p-4 clip-corner">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                Abilities
              </div>
              <div
                className="flex items-center gap-1 text-[10px] uppercase tracking-widest"
                style={{ color: agent.hue }}
              >
                <RoleIcon className="w-3 h-3" />
                {roleInfo.label}
              </div>
            </div>
            <div className="grid gap-2">
              <AbilityRow k="C" name={agent.abilities.c} accent={agent.hue} kind="grenade" />
              <AbilityRow k="Q" name={agent.abilities.q} accent={agent.hue} kind="control" />
              <AbilityRow k="E" name={agent.abilities.e} accent={agent.hue} kind="movement" />
              <AbilityRow k="X" name={agent.abilities.ult} accent={agent.hue} kind="ultimate" ult />
            </div>
          </div>

          <div className="border border-border bg-card/50 backdrop-blur p-4 clip-corner">
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
              Voice preview
            </div>
            <div className="text-sm text-foreground italic">«{agent.lines.select}»</div>
            <button
              onClick={() => playAgentLine(agent, "select")}
              className="mt-2 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[var(--neon)] hover:text-foreground transition-colors"
            >
              <Volume2 className="w-3 h-3" /> Прослушать
            </button>
          </div>

          <div className="mt-auto">
            <button
              onClick={() => {
                if (locked) return;
                setLocked(true);
                setCountdown(3);
                playAgentLine(agent, "select");
              }}
              disabled={locked}
              className="w-full py-4 text-lg font-black uppercase tracking-[0.3em] clip-corner transition-all disabled:opacity-80 flex items-center justify-center gap-2"
              style={{
                background: locked ? `${agent.hue}33` : agent.hue,
                color: locked ? agent.hue : "#0a0e1a",
                boxShadow: `0 0 24px ${agent.hue}66`,
              }}
            >
              {locked ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Загрузка {countdown}
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" /> Lock in
                </>
              )}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AbilityRow({
  k,
  name,
  accent,
  kind,
  ult,
}: {
  k: string;
  name: string;
  accent: string;
  kind: "grenade" | "control" | "movement" | "ultimate";
  ult?: boolean;
}) {
  const Icon =
    kind === "grenade"
      ? Bomb
      : kind === "control"
        ? Sparkles
        : kind === "movement"
          ? Footprints
          : Crown;
  return (
    <div
      className="flex items-center gap-3 p-2 border bg-background/35"
      style={{ borderColor: ult ? `${accent}88` : `${accent}33` }}
    >
      <div
        className="w-9 h-9 grid place-items-center text-xs font-black border shrink-0"
        style={{
          borderColor: accent,
          color: accent,
          background: ult ? `${accent}22` : "transparent",
          boxShadow: `0 0 14px ${accent}33`,
        }}
      >
        {k}
      </div>
      <Icon className="w-4 h-4 shrink-0" style={{ color: accent }} />
      <div className="min-w-0">
        <div className="text-sm font-bold leading-tight">{name}</div>
        <div className="text-[9px] uppercase tracking-widest text-muted-foreground">
          {ult ? "Ultimate" : "Role ability"}
        </div>
      </div>
    </div>
  );
}

function MapReveal({ map }: { map: GameMap }) {
  return (
    <div className="fixed inset-0 bg-background text-foreground flex items-center justify-center overflow-hidden">
      <div
        className="absolute inset-0 transition-transform duration-[2200ms]"
        style={{
          background: map.image ? `url(${map.image}) center/cover no-repeat` : map.preview,
          transform: "scale(1.08)",
          animation: "force-one-zoom 2.4s ease-out both",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-background/20" />
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6">
        <div className="text-[10px] uppercase tracking-[0.5em] text-[var(--neon)] mb-4 animate-pulse">
          Карта выбрана случайно
        </div>
        <div
          className="text-6xl md:text-7xl font-black tracking-tight"
          style={{ textShadow: "0 0 30px rgba(0,0,0,0.8)" }}
        >
          {map.name.toUpperCase()}
        </div>
        <div className="text-lg text-muted-foreground mt-3">{map.tagline}</div>

        <p className="max-w-xl text-sm text-foreground/80 leading-relaxed mt-6">{map.lore}</p>

        <div className="grid grid-cols-2 gap-3 mt-6 w-full max-w-xl">
          {map.sites.map((s) => (
            <div
              key={s.key}
              className="border border-border bg-card/60 backdrop-blur p-3 text-left clip-corner"
            >
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 grid place-items-center text-xs font-black border border-[var(--neon)] text-[var(--neon)]">
                  {s.key}
                </div>
                <div className="text-sm font-bold uppercase tracking-wider">{s.name}</div>
              </div>
              <div className="text-xs text-muted-foreground mt-1.5">{s.description}</div>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-5">
          {map.designNotes.map((n) => (
            <span
              key={n}
              className="text-[10px] uppercase tracking-widest px-2 py-1 border border-border bg-card/40 text-muted-foreground"
            >
              {n}
            </span>
          ))}
        </div>

        <div className="mt-8 flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">
          <span className="w-2 h-2 rounded-full bg-[var(--neon)] animate-pulse" />
          Подключение к матчу
        </div>
      </div>
      <style>{`@keyframes force-one-zoom { from { transform: scale(1.18); opacity: 0.4 } to { transform: scale(1.05); opacity: 1 } }`}</style>
    </div>
  );
}
