import { useEffect, useRef, useState } from "react";
import { FPSEngine } from "@/game/fps-engine";
import type { GameConfig, RunState } from "@/game/types";
import { addMatchResult, loadProfile, type Profile } from "@/game/profile";
import type { Settings } from "@/game/settings";
import type { Agent } from "@/game/data/agents";
import { AgentAvatar } from "@/game/AgentAvatar";
import { playAgentLine, prefetchAgentLines } from "@/game/voice";
import {
  RoundBanner, RoundObjective, KillFeed, Minimap,
  BuyPhaseOverlay, RoundEndOverlay, MatchEndOverlay,
} from "@/game/RoundHUD";
import { createInitialRound, ROUND_CONFIG, type KillFeedEntry, type RoundState } from "@/game/round";

export function FPSGame({
  cfg, settings, agent, onExit,
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
    setFeed(f => [...f.slice(-12), entry]);
    setTimeout(() => setFeed(f => f.filter(x => x.id !== entry.id)), 6000);
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
            pushFeed({ killer: agent.name, victim: "ENEMY", hue: agent.hue, headshot: Math.random() < 0.35 });
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
      onEnd: () => { /* round system handles match end */ },
    });
    engine.setPaused(true); // start in buy phase
    engineRef.current = engine;
    return () => engine.dispose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { engineRef.current?.updateSettings(settings); }, [settings]);

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
        engine.setPaused(false);
        setRound({ ...r, phase: "live", phaseEndAt: now + ROUND_CONFIG.liveSec * 1000, roundKills: 0, roundDeaths: 0 });
      } else if (r.phase === "live") {
        // sync round counters
        if (liveKills !== r.roundKills || liveDeaths !== r.roundDeaths) {
          setRound({ ...r, roundKills: liveKills, roundDeaths: liveDeaths });
        }
        // win/lose conditions
        const won = liveKills >= ROUND_CONFIG.killTarget;
        const timedOut = now >= r.phaseEndAt;
        if (won || timedOut) {
          const result: "won" | "lost" = won ? "won" : "lost";
          const newScore = { ...r.score };
          if (won) newScore.you += 1; else newScore.enemy += 1;
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
          setRound({ ...r, phase: "match-end", matchWon: youWon || (lastRound && r.score.you > r.score.enemy) });
          return;
        }
        // next round — reset engine state & baselines
        engine.resetForRound();
        baseKillsRef.current = state?.kills ?? 0; // after reset onState will catch up to 0
        baseDeathsRef.current = state?.deaths ?? 0;
        prevKillsRef.current = 0;
        prevDeathsRef.current = 0;
        setRound({
          ...r, phase: "buy", round: r.round + 1,
          phaseEndAt: now + ROUND_CONFIG.buySec * 1000,
          roundKills: 0, roundDeaths: 0, lastRoundResult: undefined,
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
      won, kills: r.totalKills, deaths: r.totalDeaths, mode: cfg.mode,
    });
    onExit(next, { won, kills: r.totalKills, deaths: r.totalDeaths });
  };

  const modeLabel = cfg.mode === "quick" ? "Быстрая" : cfg.mode === "unranked" ? "Безранговый" : "Рейтинговый";

  return (
    <div className="fixed inset-0 bg-background">
      <div ref={hostRef} className="absolute inset-0" />
      {state && (
        <>
          {/* Top score banner + timer */}
          <RoundBanner round={round} agent={agent} />

          {/* Round objective chip */}
          <RoundObjective round={round} agent={agent} />

          {/* Minimap + kill feed */}
          {engineRef.current && <Minimap engine={engineRef.current} agent={agent} />}
          <KillFeed feed={feed} />

          {/* Top-left agent chip */}
          <div className="absolute top-3 left-4 flex items-center gap-3 bg-card/80 backdrop-blur px-3 py-2 border border-border clip-corner pointer-events-none animate-fade-in">
            <AgentAvatar agent={agent} size={36} />
            <div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-widest">{modeLabel}</div>
              <div className="text-base font-black leading-none" style={{ color: agent.hue }}>{agent.name}</div>
            </div>
          </div>

          {/* Crosshair */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="relative w-6 h-6">
              <div className="absolute left-1/2 top-0 w-px h-2 bg-accent -translate-x-1/2" />
              <div className="absolute left-1/2 bottom-0 w-px h-2 bg-accent -translate-x-1/2" />
              <div className="absolute top-1/2 left-0 h-px w-2 bg-accent -translate-y-1/2" />
              <div className="absolute top-1/2 right-0 h-px w-2 bg-accent -translate-y-1/2" />
              <div className="absolute left-1/2 top-1/2 w-0.5 h-0.5 bg-accent -translate-x-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Bottom HUD: HP / abilities / ammo */}
          <div className="absolute bottom-0 left-0 right-0 p-4 flex justify-between items-end pointer-events-none gap-4">
            <div className="bg-card/80 backdrop-blur px-4 py-3 border border-border min-w-52 clip-corner">
              <div className="flex justify-between text-xs mb-1"><span>HP</span><span className="font-bold">{Math.max(0, Math.round(state.hp))}</span></div>
              <div className="h-1.5 bg-secondary overflow-hidden"><div className="h-full bg-destructive transition-all" style={{ width: `${Math.max(0, state.hp)}%` }} /></div>
              <div className="flex justify-between text-xs mt-2 mb-1"><span>Броня</span><span className="font-bold">{Math.max(0, Math.round(state.armor))}</span></div>
              <div className="h-1.5 bg-secondary overflow-hidden"><div className="h-full bg-accent transition-all" style={{ width: `${Math.max(0, state.armor)}%` }} /></div>
            </div>

            <div className="flex gap-2">
              {(["q","e","x"] as const).map(k => {
                const ab = state.abilities[k];
                const label = k === "q" ? agent.abilities.q : k === "e" ? agent.abilities.e : agent.abilities.ult;
                return (
                  <div key={k} className="bg-card/80 backdrop-blur w-24 h-20 border border-border flex flex-col items-center justify-center px-1 clip-corner" title={label}>
                    <div className="text-[9px] uppercase text-muted-foreground truncate w-full text-center">{label}</div>
                    <div className={`text-2xl font-black ${ab.charges > 0 ? "" : "text-muted-foreground"}`} style={ab.charges > 0 ? { color: agent.hue } : undefined}>{k.toUpperCase()}</div>
                    <div className="text-[10px]">{ab.charges > 0 ? `${ab.charges}/${ab.max}` : `${Math.ceil(ab.cd)}s`}</div>
                  </div>
                );
              })}
            </div>

            <div className="bg-card/80 backdrop-blur px-5 py-3 border border-border text-right min-w-44 clip-corner">
              <div className="text-4xl font-black text-primary leading-none">{state.mag}<span className="text-lg text-muted-foreground"> / {state.ammo}</span></div>
              <div className="text-xs text-muted-foreground mt-1">
                {state.reloading > 0 ? `Перезарядка ${state.reloading.toFixed(1)}s` : "R — перезарядка"}
              </div>
            </div>
          </div>

          {/* Phase overlays */}
          {round.phase === "buy" && <BuyPhaseOverlay round={round} agent={agent} />}
          {round.phase === "end" && <RoundEndOverlay round={round} />}
          {round.phase === "match-end" && (
            <MatchEndOverlay round={round} agent={agent} onExit={handleMatchExit} />
          )}

          {state.flashed > 0 && (
            <div className="absolute inset-0 bg-white pointer-events-none" style={{ opacity: Math.min(1, state.flashed / 2) }} />
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
                <div className="text-3xl font-black" style={{ color: agent.hue }}>Кликни чтобы захватить мышь</div>
                <div className="text-muted-foreground">WASD — движение • Мышь — обзор • ЛКМ — огонь • R — перезарядка</div>
                <div className="text-muted-foreground">Q — {agent.abilities.q} • E — {agent.abilities.e} • X — {agent.abilities.ult} • Esc — выйти из захвата</div>
                <div className="text-xs text-muted-foreground/70 mt-2">Round 1: {ROUND_CONFIG.killTarget} киллов за {ROUND_CONFIG.liveSec}s · First to {ROUND_CONFIG.toWin}</div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
