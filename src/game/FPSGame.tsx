import { useEffect, useRef, useState } from "react";
import { FPSEngine } from "@/game/fps-engine";
import type { GameConfig, RunState } from "@/game/types";
import { addMatchResult, loadProfile, type Profile } from "@/game/profile";
import type { Settings } from "@/game/settings";
import type { Agent } from "@/game/data/agents";
import { CATEGORIES, WEAPONS, type Weapon } from "@/game/data/weapons";
import { AgentAvatar } from "@/game/AgentAvatar";
import { playAgentLine, prefetchAgentLines } from "@/game/voice";
import {
  RoundBanner,
  RoundObjective,
  KillFeed,
  Minimap,
  BuyPhaseOverlay,
  RoundEndOverlay,
  MatchEndOverlay,
} from "@/game/RoundHUD";
import {
  createInitialRound,
  ROUND_CONFIG,
  type KillFeedEntry,
  type RoundState,
} from "@/game/round";

export function FPSGame({
  cfg,
  settings,
  agent,
  onExit,
}: {
  cfg: GameConfig;
  settings: Settings;
  agent: Agent;
  onExit: (profile: Profile, result: { won: boolean; kills: number; deaths: number }) => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<FPSEngine | null>(null);
  const [state, setState] = useState<RunState | null>(null);
  const [needsClick, setNeedsClick] = useState(true);
  const [buyMenuOpen, setBuyMenuOpen] = useState(false);
  const [credits, setCredits] = useState(8000);

  // ===== Round/match state (client-side competitive layer) =====
  const [round, setRound] = useState<RoundState>(() => createInitialRound());
  const roundRef = useRef(round);
  roundRef.current = round;

  const [feed, setFeed] = useState<KillFeedEntry[]>([]);
  const feedIdRef = useRef(0);
  const prevKillsRef = useRef(0);
  const prevDeathsRef = useRef(0);
  // baselines used so we can read kills/deaths *this round* from engine totals
  const baseKillsRef = useRef(0);
  const baseDeathsRef = useRef(0);

  const pushFeed = (e: Omit<KillFeedEntry, "id" | "ts">) => {
    feedIdRef.current += 1;
    const entry: KillFeedEntry = { ...e, id: feedIdRef.current, ts: performance.now() };
    setFeed((f) => [...f.slice(-12), entry]);
    setTimeout(() => setFeed((f) => f.filter((x) => x.id !== entry.id)), 6000);
  };

  // ===== Boot engine — force deathmatch end-condition off; rounds drive the match =====
  useEffect(() => {
    if (!hostRef.current) return;
    prefetchAgentLines(agent);
    const engineCfg: GameConfig = { ...cfg, agent, killsToWin: 9999 };
    const engine = new FPSEngine(hostRef.current, engineCfg, settings, {
      onState: (s) => {
        setState(s);
        // detect kill/death deltas → kill-feed + round progress
        if (s.kills > prevKillsRef.current) {
          const delta = s.kills - prevKillsRef.current;
          for (let i = 0; i < delta; i++) {
            pushFeed({
              killer: agent.name,
              victim: "ENEMY",
              hue: agent.hue,
              headshot: Math.random() < 0.35,
            });
          }
        }
        if (s.deaths > prevDeathsRef.current) {
          const delta = s.deaths - prevDeathsRef.current;
          for (let i = 0; i < delta; i++) {
            pushFeed({ killer: "ENEMY", victim: agent.name, hue: "#ff4d6d" });
          }
        }
        prevKillsRef.current = s.kills;
        prevDeathsRef.current = s.deaths;
      },
      onKill: () => playAgentLine(agent, "kill"),
      onRespawn: () => playAgentLine(agent, "respawn"),
      onEnd: () => {
        /* round system handles match end */
      },
    });
    engine.setPaused(true); // start in buy phase
    engineRef.current = engine;
    return () => engine.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    engineRef.current?.updateSettings(settings);
  }, [settings]);

  useEffect(() => {
    const onLoadoutKey = (event: KeyboardEvent) => {
      if (event.code === "KeyB") {
        if (roundRef.current.phase !== "buy") return;
        setBuyMenuOpen((open) => {
          if (!open) document.exitPointerLock();
          return !open;
        });
        return;
      }
      const slots: Record<string, 1 | 2 | 3 | 4> = {
        Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4,
      };
      const slot = slots[event.code];
      if (slot) engineRef.current?.equipSlot(slot);
    };
    window.addEventListener("keydown", onLoadoutKey);
    return () => window.removeEventListener("keydown", onLoadoutKey);
  }, []);

  const buyWeapon = (weapon: Weapon) => {
    if (round.phase !== "buy" || credits < weapon.price) return;
    setCredits((value) => value - weapon.price);
    engineRef.current?.purchaseWeapon(weapon);
  };

  // ===== Round phase ticker =====
  useEffect(() => {
    const id = setInterval(() => {
      const engine = engineRef.current;
      if (!engine) return;
      const r = roundRef.current;
      const now = performance.now();
      const liveKills = (state?.kills ?? 0) - baseKillsRef.current;
      const liveDeaths = (state?.deaths ?? 0) - baseDeathsRef.current;

      if (r.phase === "buy" && now >= r.phaseEndAt) {
        setBuyMenuOpen(false);
        engine.setPaused(false);
        setRound({
          ...r,
          phase: "live",
          phaseEndAt: now + ROUND_CONFIG.liveSec * 1000,
          roundKills: 0,
          roundDeaths: 0,
        });
      } else if (r.phase === "live") {
        // sync round counters
        if (liveKills !== r.roundKills || liveDeaths !== r.roundDeaths) {
          setRound({ ...r, roundKills: liveKills, roundDeaths: liveDeaths });
        }
        // win/lose conditions: kills can win, but planted pack owns the timer.
        const packDetonated = state?.objective.phase === "detonated";
        const packPlanted = state?.objective.phase === "planted";
        const won = liveKills >= ROUND_CONFIG.killTarget || packDetonated;
        const timedOut = now >= r.phaseEndAt && !packPlanted;
        if (won || timedOut) {
          const result: "won" | "lost" = won ? "won" : "lost";
          const newScore = { ...r.score };
          if (won) newScore.you += 1;
          else newScore.enemy += 1;
          engine.setPaused(true);
          playAgentLine(agent, won ? "victory" : "defeat");
          setRound({
            ...r,
            phase: "end",
            phaseEndAt: now + ROUND_CONFIG.endSec * 1000,
            score: newScore,
            lastRoundResult: result,
            totalKills: r.totalKills + liveKills,
            totalDeaths: r.totalDeaths + liveDeaths,
            bestRoundKills: Math.max(r.bestRoundKills, liveKills),
          });
        }
      } else if (r.phase === "end" && now >= r.phaseEndAt) {
        // match over?
        const youWon = r.score.you >= ROUND_CONFIG.toWin;
        const enemyWon = r.score.enemy >= ROUND_CONFIG.toWin;
        const lastRound = r.round >= ROUND_CONFIG.maxRounds;
        if (youWon || enemyWon || lastRound) {
          setRound({
            ...r,
            phase: "match-end",
            matchWon: youWon || (lastRound && r.score.you > r.score.enemy),
          });
          return;
        }
        // next round — reset engine state & baselines
        engine.resetForRound();
        baseKillsRef.current = 0;
        baseDeathsRef.current = 0;
        prevKillsRef.current = 0;
        prevDeathsRef.current = 0;
        setRound({
          ...r,
          phase: "buy",
          round: r.round + 1,
          phaseEndAt: now + ROUND_CONFIG.buySec * 1000,
          roundKills: 0,
          roundDeaths: 0,
          lastRoundResult: undefined,
        });
      }
    }, 150);
    return () => clearInterval(id);
  }, [state?.kills, state?.deaths, agent]);

  const handleMatchExit = () => {
    const engine = engineRef.current;
    const r = roundRef.current;
    const won = !!r.matchWon;
    engine?.dispose();
    const profile = loadProfile();
    const next = addMatchResult(profile, {
      won,
      kills: r.totalKills,
      deaths: r.totalDeaths,
      mode: cfg.mode,
    });
    onExit(next, { won, kills: r.totalKills, deaths: r.totalDeaths });
  };

  const modeLabel =
    cfg.mode === "quick" ? "Быстрая" : cfg.mode === "unranked" ? "Безранговый" : "Рейтинговый";

  return (
    <div className="fixed inset-0 bg-background">
      <div ref={hostRef} className="absolute inset-0" />
      {state && (
        <>
          {/* Top score banner + timer */}
          <RoundBanner round={round} agent={agent} />

          {/* Round objective chip */}
          <RoundObjective round={round} agent={agent} state={state} />

          {/* Minimap + kill feed */}
          {engineRef.current && <Minimap engine={engineRef.current} agent={agent} />}
          <KillFeed feed={feed} />

          {/* Top-left agent chip */}
          <div className="absolute top-3 left-4 flex items-center gap-3 bg-card/80 backdrop-blur px-3 py-2 border border-border clip-corner pointer-events-none animate-fade-in">
            <AgentAvatar agent={agent} size={36} />
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-widest">
                {modeLabel}
              </div>
              <div className="text-base font-black leading-none" style={{ color: agent.hue }}>
                {agent.name}
              </div>
            </div>
          </div>

          {/* Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-12 h-12">
              <div className="absolute left-1/2 w-px h-2 bg-accent -translate-x-1/2 transition-all duration-75" style={{ bottom: `calc(50% + ${4 + state.spread * 12}px)` }} />
              <div className="absolute left-1/2 w-px h-2 bg-accent -translate-x-1/2 transition-all duration-75" style={{ top: `calc(50% + ${4 + state.spread * 12}px)` }} />
              <div className="absolute top-1/2 h-px w-2 bg-accent -translate-y-1/2 transition-all duration-75" style={{ right: `calc(50% + ${4 + state.spread * 12}px)` }} />
              <div className="absolute top-1/2 h-px w-2 bg-accent -translate-y-1/2 transition-all duration-75" style={{ left: `calc(50% + ${4 + state.spread * 12}px)` }} />
              <div className="absolute left-1/2 top-1/2 w-0.5 h-0.5 bg-accent -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Bottom HUD: HP / abilities / ammo */}
          <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-between items-end pointer-events-none gap-4">
            <div className="bg-card/80 backdrop-blur px-4 py-3 border border-border min-w-52 clip-corner">
              <div className="flex justify-between text-xs mb-1">
                <span>HP</span>
                <span className="font-bold">{Math.max(0, Math.round(state.hp))}</span>
              </div>
              <div className="h-1.5 bg-secondary overflow-hidden">
                <div
                  className="h-full bg-destructive transition-all"
                  style={{ width: `${Math.max(0, state.hp)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs mt-2 mb-1">
                <span>Броня</span>
                <span className="font-bold">{Math.max(0, Math.round(state.armor))}</span>
              </div>
              <div className="h-1.5 bg-secondary overflow-hidden">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${Math.max(0, state.armor)}%` }}
                />
              </div>
            </div>

            <div className="flex gap-2">
              {(["c", "q", "e", "x"] as const).map((k) => {
                const ab = state.abilities[k];
                const label =
                  k === "c"
                    ? agent.abilities.c
                    : k === "q"
                      ? agent.abilities.q
                      : k === "e"
                        ? agent.abilities.e
                        : agent.abilities.ult;
                return (
                  <div
                    key={k}
                    className="relative bg-card/85 backdrop-blur w-28 h-20 border flex flex-col items-center justify-center px-2 clip-corner overflow-hidden"
                    title={label}
                    style={{
                      borderColor: ab.charges > 0 ? `${agent.hue}88` : "var(--color-border)",
                      boxShadow: ab.charges > 0 ? `0 0 20px ${agent.hue}22` : undefined,
                    }}
                  >
                    <div
                      className="absolute inset-x-0 bottom-0 h-1"
                      style={{
                        background: agent.hue,
                        opacity: ab.charges > 0 ? 0.9 : 0.25,
                        transform: `scaleX(${ab.charges > 0 ? ab.charges / ab.max : 1 - Math.min(1, ab.cd / ab.cooldown)})`,
                        transformOrigin: "left",
                      }}
                    />
                    <div
                      className="absolute -right-5 -top-8 w-16 h-16 rounded-full blur-2xl opacity-30"
                      style={{ background: agent.hue }}
                    />
                    <div className="relative text-[9px] uppercase text-muted-foreground truncate w-full text-center">
                      {label}
                    </div>
                    <div
                      className={`relative text-2xl font-black ${ab.charges > 0 ? "" : "text-muted-foreground"}`}
                      style={ab.charges > 0 ? { color: agent.hue, textShadow: `0 0 14px ${agent.hue}` } : undefined}
                    >
                      {k.toUpperCase()}
                    </div>
                    <div className="relative text-[10px] tabular-nums">
                      {ab.charges > 0 ? `${ab.charges}/${ab.max}` : `${Math.ceil(ab.cd)}s`}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-card/80 backdrop-blur px-5 py-3 border border-border text-right min-w-44 clip-corner">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground mb-1">
                {state.equippedSlot} · {state.equippedName}
              </div>
              <div className="text-4xl font-black text-primary leading-none">
                {state.mag}
                <span className="text-lg text-muted-foreground"> / {state.ammo}</span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {state.reloading > 0
                  ? `Перезарядка ${state.reloading.toFixed(1)}s`
                  : "R — перезарядка"}
              </div>
            </div>
          </div>

          {/* Phase overlays */}
          {round.phase === "buy" && <BuyPhaseOverlay round={round} agent={agent} />}
          {buyMenuOpen && round.phase === "buy" && (
            <div className="absolute inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-8">
              <div className="w-full max-w-7xl h-[86vh] overflow-auto bg-[#0d171a] border border-[#6d7f7d] p-6">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <div className="text-2xl font-black uppercase tracking-[0.18em]">Купить оружие</div>
                    <div className="text-xs text-[#9aadaa]">B — закрыть · оружие сохраняется в слотах 1 и 2</div>
                  </div>
                  <div className="border-l border-[#526563] pl-6 text-right"><div className="text-[10px] uppercase text-[#9aadaa]">Баланс</div><div className="text-2xl font-black text-[#c8f5e7]">¤ {credits}</div></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {CATEGORIES.map((category) => (
                    <section key={category}>
                      <div className="mb-1 px-2 py-1 bg-[#263637] text-[10px] font-black uppercase tracking-[0.2em] text-[#c8d4d1]">{category}</div>
                      <div className="grid grid-cols-2 gap-1">
                        {WEAPONS.filter((weapon) => weapon.category === category).map((weapon) => {
                          const equipped = state.equippedName === weapon.name;
                          return <button key={weapon.id} disabled={credits < weapon.price} onClick={() => buyWeapon(weapon)} className={`relative min-h-28 text-left border p-3 transition-colors ${equipped ? "border-[#8fffd9] bg-[#315b52]" : "border-[#405354] bg-[#162325] hover:bg-[#243638] hover:border-[#91aaa6]"} disabled:opacity-30`}>
                            <div className="font-black uppercase text-sm">{weapon.name}</div>
                            <div className="mt-4 h-1 bg-[#2f4142] overflow-hidden"><div className="h-full bg-[#b9d4ce]" style={{ width: `${weapon.accuracy}%` }} /></div>
                            <div className="mt-2 flex justify-between text-[10px] text-[#a8bab6]"><span>{weapon.damage} DMG · {weapon.magazine} MAG</span><span className="font-black text-white">¤ {weapon.price}</span></div>
                            {equipped && <div className="absolute right-2 top-2 text-[9px] font-black text-[#8fffd9]">КУПЛЕНО</div>}
                          </button>;
                        })}
                      </div>
                    </section>
                  ))}
                </div>
                <div className="sticky bottom-0 mt-5 border-t border-[#526563] bg-[#0d171a]/95 pt-3 text-xs text-[#9aadaa]">1 — основное · 2 — пистолет · 3 — нож · 4 — бомба</div>
              </div>
            </div>
          )}
          {round.phase === "end" && <RoundEndOverlay round={round} />}
          {round.phase === "match-end" && (
            <MatchEndOverlay round={round} agent={agent} onExit={handleMatchExit} />
          )}

          {state.flashed > 0 && (
            <div
              className="absolute inset-0 bg-white pointer-events-none"
              style={{ opacity: Math.min(1, state.flashed / 2) }}
            />
          )}

          {/* Top-right exit (during play) */}
          {round.phase !== "match-end" && (
            <button
              className="absolute top-3 right-4 bg-card/80 backdrop-blur px-3 py-1.5 border border-border text-xs hover:bg-card pointer-events-auto uppercase tracking-widest clip-corner"
              onClick={handleMatchExit}
            >
              Выйти
            </button>
          )}

          {needsClick && round.phase !== "match-end" && (
            <div
              className="absolute inset-0 flex items-center justify-center bg-black/70 cursor-pointer z-40"
              onClick={() => {
                setNeedsClick(false);
                engineRef.current?.requestPointerLock();
              }}
            >
              <div className="text-center space-y-3">
                <div className="text-3xl font-black" style={{ color: agent.hue }}>
                  Кликни чтобы захватить мышь
                </div>
                <div className="text-muted-foreground">
                  WASD — движение • Мышь — обзор • ЛКМ — огонь • R — перезарядка
                </div>
                <div className="text-muted-foreground">
                  C — {agent.abilities.c} • Q — {agent.abilities.q} • E — {agent.abilities.e} • X —{" "}
                  {agent.abilities.ult} • Esc — выйти из захвата
                </div>
                <div className="text-xs text-muted-foreground/70 mt-2">
                  Round 1: {ROUND_CONFIG.killTarget} киллов за {ROUND_CONFIG.liveSec}s · First to{" "}
                  {ROUND_CONFIG.toWin}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
