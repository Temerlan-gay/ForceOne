import { useEffect, useMemo, useState } from "react";
import { Navigate } from "@tanstack/react-router";
import { FPSGame } from "@/game/FPSGame";
import type { GameConfig, MatchMode } from "@/game/types";
import {
  loadProfile,
  saveProfile,
  fetchProfile,
  syncProfile,
  xpForLevel,
  type Profile,
} from "@/game/profile";
import { loadSettings, saveSettings, DEFAULT_SETTINGS, type Settings } from "@/game/settings";
import { AGENTS, ROLE_DETAILS, type Agent } from "@/game/data/agents";
import { WEAPONS, CATEGORIES, type Weapon } from "@/game/data/weapons";
import { MAPS, type GameMap } from "@/game/data/maps";
import { AgentSelect } from "@/game/AgentSelect";

import { useAuth, signOut } from "@/hooks/useAuth";
import {
  Crosshair,
  Trophy,
  Zap,
  Lock,
  Settings as SettingsIcon,
  Play,
  Swords,
  Users,
  Package,
  Award,
  ShoppingBag,
  BarChart3,
  ChevronRight,
  Search,
  Volume2,
  Monitor,
  Activity,
  LogOut,
} from "lucide-react";

type Screen = "menu" | "agent_select" | "playing";
type NavKey = "play" | "agents" | "collection" | "career" | "store" | "battlepass" | "settings";

export function App() {
  const auth = useAuth();
  const [screen, setScreen] = useState<Screen>("menu");
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [cfg, setCfg] = useState<GameConfig | null>(null);
  const [lastResult, setLastResult] = useState<{ won: boolean } | null>(null);
  const [nav, setNav] = useState<NavKey>("play");
  const [agent, setAgent] = useState<Agent>(AGENTS[0]);
  const [map, setMap] = useState<GameMap>(MAPS[0]);
  const [multiplayer, setMultiplayer] = useState<boolean>(true);
  const [pendingMode, setPendingMode] = useState<MatchMode | null>(null);
  const [rolledMap, setRolledMap] = useState<GameMap | null>(null);

  // Hydrate profile from DB when the user signs in
  useEffect(() => {
    if (!auth.user) return;
    fetchProfile(auth.user.id).then((p) => {
      if (p) {
        setProfile(p);
        saveProfile(p);
      }
    });
  }, [auth.user]);

  // Persist progression both locally and to DB when signed in
  useEffect(() => {
    saveProfile(profile);
    if (auth.user) syncProfile(auth.user.id, profile).catch(() => {});
  }, [profile, auth.user]);
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Auth gate — redirect to /auth while loading is done
  if (!auth.loading && !auth.user) {
    return <Navigate to="/auth" />;
  }
  if (auth.loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-xs uppercase tracking-[0.4em] text-muted-foreground animate-pulse">
          Загрузка…
        </div>
      </div>
    );
  }

  const startMatch = (mode: MatchMode) => {
    if (mode === "ranked" && profile.level < 15) return;
    // Pick a random map (instead of using the manually-selected one)
    const picked = MAPS[Math.floor(Math.random() * MAPS.length)];
    setRolledMap(picked);
    setPendingMode(mode);
    setScreen("agent_select");
  };

  const handleAgentLockIn = (chosenAgent: Agent) => {
    if (!pendingMode || !rolledMap) return;
    setAgent(chosenAgent);
    setMap(rolledMap);
    const cfgMap: Record<MatchMode, GameConfig> = {
      quick: { mode: "quick", killsToWin: 10, botCount: 3 },
      unranked: { mode: "unranked", killsToWin: 15, botCount: 4 },
      ranked: { mode: "ranked", killsToWin: 20, botCount: 5 },
    };
    const playerName = profile.username || `Op_${profile.level}`;
    setCfg({
      ...cfgMap[pendingMode],
      multiplayer,
      room: `${rolledMap.id}-${pendingMode}`,
      playerName,
      mapId: rolledMap.id,
      mapTheme: rolledMap.theme,
      timeOfDay: rolledMap.timeOfDay,
      dynamicCycle: rolledMap.dynamicCycle,
      agent: chosenAgent,
    });
    setLastResult(null);
    setScreen("playing");
  };

  if (screen === "agent_select" && rolledMap) {
    return (
      <AgentSelect
        map={rolledMap}
        initialAgent={agent}
        onLockIn={handleAgentLockIn}
        onBack={() => {
          setScreen("menu");
          setPendingMode(null);
          setRolledMap(null);
        }}
      />
    );
  }

  if (screen === "playing" && cfg) {
    return (
      <FPSGame
        cfg={cfg}
        settings={settings}
        agent={agent}
        onExit={(p) => {
          setProfile(p);
          setLastResult({ won: p.matches > profile.matches && p.wins > profile.wins });
          setScreen("menu");
        }}
      />
    );
  }

  const xpNeeded = xpForLevel(profile.level);
  const xpPct = Math.min(100, (profile.xp / xpNeeded) * 100);

  return (
    <div className="min-h-screen bg-background text-foreground relative overflow-hidden flex flex-col">
      {/* ambient bg */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-60 -left-40 w-[700px] h-[700px] rounded-full bg-primary/12 blur-[120px]" />
        <div className="absolute -bottom-60 -right-40 w-[700px] h-[700px] rounded-full bg-[var(--neon)]/10 blur-[140px]" />
        <div className="absolute top-1/3 right-1/4 w-[400px] h-[400px] rounded-full bg-[var(--neon-pink)]/8 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.05]"
          style={{
            backgroundImage:
              "linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
      </div>

      <TopBar
        profile={profile}
        xpPct={xpPct}
        xpNeeded={xpNeeded}
        email={auth.user?.email ?? ""}
        onSignOut={signOut}
      />

      <div className="relative flex-1 flex">
        <SideNav nav={nav} onChange={setNav} />

        <main className="flex-1 overflow-y-auto px-8 py-8">
          {lastResult && (
            <div
              className={`mb-6 p-4 rounded-md border backdrop-blur clip-corner ${
                lastResult.won
                  ? "bg-[var(--neon)]/10 border-[var(--neon)] text-[var(--neon)]"
                  : "bg-destructive/10 border-destructive text-destructive"
              }`}
            >
              <div className="font-bold uppercase tracking-widest text-sm">
                {lastResult.won ? "Victory · +XP начислено" : "Defeat · Попробуй снова"}
              </div>
            </div>
          )}

          {nav === "play" && (
            <PlayPage
              profile={profile}
              agent={agent}
              map={map}
              multiplayer={multiplayer}
              onToggleMultiplayer={setMultiplayer}
              onPickMap={setMap}
              onStart={startMatch}
            />
          )}
          {nav === "agents" && <AgentsPage selected={agent} onPick={setAgent} />}
          {nav === "collection" && <CollectionPage />}
          {nav === "career" && <CareerPage profile={profile} />}
          {nav === "store" && <StorePage />}
          {nav === "battlepass" && <BattlepassPage profile={profile} />}
          {nav === "settings" && <SettingsPage settings={settings} onChange={setSettings} />}
        </main>
      </div>
    </div>
  );
}

/* ---------- Top bar ---------- */
function TopBar({
  profile,
  xpPct,
  xpNeeded,
  email,
  onSignOut,
}: {
  profile: Profile;
  xpPct: number;
  xpNeeded: number;
  email: string;
  onSignOut: () => void;
}) {
  return (
    <header className="relative z-10 border-b border-border bg-sidebar/80 backdrop-blur">
      <div className="px-6 h-16 flex items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <LogoMark />
          <div>
            <div className="text-xl font-black tracking-[0.25em] leading-none">
              <span className="text-foreground">FORCE</span>
              <span className="text-primary text-glow-primary">ONE</span>
            </div>
            <div className="text-[10px] text-muted-foreground uppercase tracking-[0.4em] mt-1">
              Tactical FPS · Episode 1: Ignition
            </div>
          </div>
        </div>

        <div className="flex items-center gap-5">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded border border-border bg-card/60">
            <Activity className="w-3.5 h-3.5 text-[var(--neon)]" />
            <span className="text-[11px] font-mono text-muted-foreground">
              PING <span className="text-foreground">12ms</span> · FPS{" "}
              <span className="text-foreground">144</span>
            </span>
          </div>

          <div className="text-right">
            <div className="text-[9px] text-muted-foreground uppercase tracking-[0.3em]">LVL</div>
            <div className="text-2xl font-black text-[var(--neon)] leading-none text-glow-neon">
              {profile.level}
            </div>
          </div>

          <div className="w-48">
            <div className="flex justify-between text-[9px] text-muted-foreground mb-1 uppercase tracking-[0.3em]">
              <span>Battle XP</span>
              <span>
                {profile.xp} / {xpNeeded}
              </span>
            </div>
            <div className="h-1.5 bg-secondary overflow-hidden border border-border">
              <div
                className="h-full bg-gradient-to-r from-primary via-[var(--neon)] to-[var(--neon-pink)]"
                style={{ width: `${xpPct}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 pl-3 border-l border-border">
            <div
              className="w-9 h-9 grid place-items-center font-black text-sm clip-corner border border-border"
              style={{
                background: profile.avatar_color + "22",
                color: profile.avatar_color,
                borderColor: profile.avatar_color + "66",
              }}
              title={email}
            >
              {(profile.username || "U").charAt(0).toUpperCase()}
            </div>
            <div className="hidden md:block">
              <div className="text-sm font-bold leading-tight">{profile.username}</div>
              <div className="text-[10px] text-muted-foreground leading-tight">{profile.rank}</div>
            </div>
            <button
              onClick={onSignOut}
              title="Выйти"
              className="ml-1 p-2 border border-border hover:border-destructive hover:text-destructive transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

function LogoMark() {
  return (
    <div className="relative w-10 h-10">
      <div className="absolute inset-0 rotate-45 border-2 border-primary border-glow-primary" />
      <div className="absolute inset-1.5 rotate-45 border border-[var(--neon)]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Crosshair className="w-4 h-4 text-[var(--neon)]" />
      </div>
    </div>
  );
}

/* ---------- Side nav ---------- */
function SideNav({ nav, onChange }: { nav: NavKey; onChange: (n: NavKey) => void }) {
  const items: { key: NavKey; label: string; Icon: React.ComponentType<{ className?: string }> }[] =
    [
      { key: "play", label: "Играть", Icon: Play },
      { key: "agents", label: "Агенты", Icon: Users },
      { key: "collection", label: "Коллекция", Icon: Package },
      { key: "career", label: "Карьера", Icon: BarChart3 },
      { key: "store", label: "Магазин", Icon: ShoppingBag },
      { key: "battlepass", label: "Battle Pass", Icon: Award },
      { key: "settings", label: "Настройки", Icon: SettingsIcon },
    ];

  return (
    <aside className="relative z-10 w-60 shrink-0 border-r border-border bg-sidebar/60 backdrop-blur py-6 px-3 hidden md:flex flex-col gap-1">
      {items.map(({ key, label, Icon }) => {
        const active = nav === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            className={`group relative flex items-center gap-3 px-3 py-2.5 text-left transition-all clip-corner ${
              active
                ? "bg-primary/15 text-foreground border border-primary/60 border-glow-primary"
                : "text-muted-foreground hover:text-foreground hover:bg-card/60 border border-transparent"
            }`}
          >
            {active && (
              <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 bg-[var(--neon)]" />
            )}
            <Icon className={`w-4 h-4 ${active ? "text-[var(--neon)]" : ""}`} />
            <span className="text-sm font-bold uppercase tracking-wider">{label}</span>
            {active && <ChevronRight className="w-3.5 h-3.5 ml-auto text-[var(--neon)]" />}
          </button>
        );
      })}

      <div className="mt-auto pt-6 border-t border-border">
        <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em] mb-2 px-3">
          Online
        </div>
        <div className="px-3 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-[var(--neon)] animate-pulse" />
          <span className="text-xs text-muted-foreground">12 437 игроков</span>
        </div>
      </div>
    </aside>
  );
}

/* ---------- PLAY ---------- */
function PlayPage({
  profile,
  agent,
  map,
  multiplayer,
  onToggleMultiplayer,
  onPickMap,
  onStart,
}: {
  profile: Profile;
  agent: Agent;
  map: GameMap;
  multiplayer: boolean;
  onToggleMultiplayer: (v: boolean) => void;
  onPickMap: (m: GameMap) => void;
  onStart: (m: MatchMode) => void;
}) {
  const rankedLocked = profile.level < 15;
  return (
    <div>
      <PageHeader
        eyebrow="Main Lobby"
        title="Готов к выходу"
        subtitle="Выбери режим, карту и агента — и в зону."
      />

      {/* Hero / map preview */}
      <div
        className="relative h-64 md:h-80 rounded-md border border-border overflow-hidden mb-8 clip-corner scanline scanline-after"
        style={{
          background: map.image ? `url(${map.image}) center/cover no-repeat` : map.preview,
        }}
      >
        <div className="absolute inset-0 bg-gradient-to-tr from-background via-background/40 to-transparent" />
        <div className="absolute inset-0 p-8 flex flex-col justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--neon)] border border-[var(--neon)]/50 px-2 py-0.5 bg-background/50">
              CURRENT MAP
            </span>
          </div>
          <div>
            <div className="text-4xl md:text-5xl font-black tracking-tight">
              {map.name.toUpperCase()}
            </div>
            <div className="text-muted-foreground mt-1">{map.tagline}</div>

            <div className="mt-4 flex items-center gap-3 text-xs">
              <span className="px-2 py-1 bg-card/80 border border-border uppercase tracking-widest">
                Агент: <span className="text-[var(--neon)]">{agent.name}</span>
              </span>
              <span className="px-2 py-1 bg-card/80 border border-border uppercase tracking-widest">
                Роль: <span className="text-foreground">{agent.role}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Multiplayer toggle */}
      <div className="mb-5 flex items-center justify-between bg-card/60 backdrop-blur border border-border p-4 clip-corner">
        <div className="flex items-center gap-3">
          <Users
            className={`w-5 h-5 ${multiplayer ? "text-[var(--neon)]" : "text-muted-foreground"}`}
          />
          <div>
            <div className="text-sm font-black uppercase tracking-widest">
              Сетевая игра {multiplayer && <span className="text-[var(--neon)]">· ONLINE</span>}
            </div>
            <div className="text-xs text-muted-foreground">
              {multiplayer
                ? `Реальные игроки в комнате «${map.id}-{режим}». Боты остаются для замеса.`
                : "Только ты и боты. Без соединения с сервером."}
            </div>
          </div>
        </div>
        <button
          onClick={() => onToggleMultiplayer(!multiplayer)}
          className={`relative w-14 h-7 rounded-full border transition-all ${
            multiplayer ? "bg-[var(--neon)]/20 border-[var(--neon)]" : "bg-secondary border-border"
          }`}
        >
          <span
            className={`absolute top-0.5 w-6 h-6 rounded-full transition-all ${
              multiplayer ? "left-7 bg-[var(--neon)]" : "left-0.5 bg-muted-foreground"
            }`}
          />
        </button>
      </div>

      {/* Modes */}
      <div className="grid md:grid-cols-3 gap-4 mb-10">
        <ModeCard
          tag="01"
          title="Быстрая игра"
          subtitle="Без подбора, мгновенный старт"
          details="10 фрагов · 3 бота · Base XP"
          icon={<Zap className="w-8 h-8" />}
          variant="accent"
          onClick={() => onStart("quick")}
        />
        <ModeCard
          tag="02"
          title="Безранговый"
          subtitle="Полноценный матч без ранга"
          details="15 фрагов · 4 бота · +50% XP"
          icon={<Swords className="w-8 h-8" />}
          variant="primary"
          onClick={() => onStart("unranked")}
        />
        <ModeCard
          tag="03"
          title="Рейтинговый"
          subtitle={rankedLocked ? "Открывается с 15 уровня" : "Матч за место в таблице"}
          details="20 фрагов · 5 ботов · +100% XP · ранг"
          icon={rankedLocked ? <Lock className="w-8 h-8" /> : <Trophy className="w-8 h-8" />}
          variant="pink"
          locked={rankedLocked}
          lockHint={`Уровень ${profile.level} / 15`}
          onClick={() => onStart("ranked")}
        />
      </div>

      {/* Maps strip */}
      <SectionTitle title="Карты" hint="Выбери поле боя" />
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-10">
        {MAPS.map((m) => {
          const sel = m.id === map.id;
          return (
            <button
              key={m.id}
              onClick={() => onPickMap(m)}
              className={`group relative h-28 overflow-hidden border text-left clip-corner transition-all ${
                sel
                  ? "border-[var(--neon)] border-glow-primary"
                  : "border-border hover:border-primary/60"
              }`}
              style={{
                background: m.image ? `url(${m.image}) center/cover no-repeat` : m.preview,
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
              <div className="absolute left-2 bottom-2 right-2">
                <div className="text-xs font-black tracking-wider uppercase">{m.name}</div>
                <div className="text-[10px] text-muted-foreground line-clamp-1">{m.tagline}</div>
              </div>
              {sel && (
                <div className="absolute top-2 right-2 text-[9px] uppercase tracking-widest text-[var(--neon)] bg-background/70 px-1.5 py-0.5 border border-[var(--neon)]/60">
                  Selected
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Controls reference */}
      <SectionTitle title="Управление" hint="Hotkeys" />
      <div className="bg-card/60 backdrop-blur border border-border p-6 clip-corner">
        <div className="grid md:grid-cols-2 gap-x-10 gap-y-2 text-sm text-muted-foreground">
          <KeyRow k="W A S D" label="Движение" />
          <KeyRow k="ЛКМ" label="Стрельба" />
          <KeyRow k="R" label="Перезарядка" />
          <KeyRow k="Мышь" label="Обзор" />
          <KeyRow k="C" label="Способность 1" />
          <KeyRow k="Q" label="Способность 2" />
          <KeyRow k="E" label="Способность 3" />
          <KeyRow k="X" label="Ультимейт" />
          <KeyRow k="Shift" label="Тихий шаг (скоро)" />
        </div>
      </div>
    </div>
  );
}

/* ---------- AGENTS ---------- */
function AgentsPage({ selected, onPick }: { selected: Agent; onPick: (a: Agent) => void }) {
  const [role, setRole] = useState<"All" | Agent["role"]>("All");
  const list = useMemo(
    () => (role === "All" ? AGENTS : AGENTS.filter((a) => a.role === role)),
    [role],
  );
  return (
    <div>
      <PageHeader
        eyebrow="Roster"
        title="Агенты"
        subtitle="10 уникальных оперативников. Каждый меняет правила боя."
      />

      <div className="flex gap-2 mb-6 flex-wrap">
        {(["All", "Duelist", "Controller", "Sentinel", "Initiator"] as const).map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            className={`px-4 py-1.5 text-xs font-bold uppercase tracking-widest border transition-colors ${
              role === r
                ? "bg-primary/20 border-primary text-foreground"
                : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
            }`}
          >
            {r === "All" ? "Все" : ROLE_DETAILS[r].label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-8">
        {list.map((a) => {
          const sel = a.id === selected.id;
          return (
            <button
              key={a.id}
              onClick={() => onPick(a)}
              className={`group relative aspect-[3/4] overflow-hidden border text-left clip-corner transition-all ${
                sel
                  ? "border-[var(--neon)] border-glow-primary"
                  : "border-border hover:border-primary/60"
              }`}
            >
              <div className={`absolute inset-0 bg-gradient-to-br ${a.gradient}`} />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/60 to-transparent" />
              <div
                className="absolute -bottom-10 -right-10 w-40 h-40 rounded-full opacity-30 blur-3xl"
                style={{ background: a.hue }}
              />
              <div className="absolute inset-0 p-3 flex flex-col">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                    {ROLE_DETAILS[a.role].label}
                  </span>
                  {sel && (
                    <span className="text-[9px] text-[var(--neon)] uppercase tracking-widest">
                      Active
                    </span>
                  )}
                </div>
                <div className="mt-auto">
                  <div
                    className="text-2xl font-black tracking-tight"
                    style={{ color: a.hue, textShadow: `0 0 16px ${a.hue}80` }}
                  >
                    {a.name.toUpperCase()}
                  </div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2 mt-1">
                    {a.tagline}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected detail */}
      <div className="bg-card/60 backdrop-blur border border-border p-6 clip-corner">
        <div className="flex items-baseline justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Выбранный агент
            </div>
            <div className="text-3xl font-black" style={{ color: selected.hue }}>
              {selected.name.toUpperCase()}
            </div>
          </div>
          <span className="text-xs uppercase tracking-widest text-muted-foreground">
            {ROLE_DETAILS[selected.role].label}
          </span>
        </div>
        <p className="text-muted-foreground mb-2">{selected.tagline}</p>
        <p className="text-sm text-muted-foreground mb-6">
          {ROLE_DETAILS[selected.role].combatStyle}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <AbilityCard k="C" name={selected.abilities.c} accent={selected.hue} />
          <AbilityCard k="Q" name={selected.abilities.q} accent={selected.hue} />
          <AbilityCard k="E" name={selected.abilities.e} accent={selected.hue} />
          <AbilityCard k="X" name={selected.abilities.ult} accent={selected.hue} ult />
        </div>
      </div>
    </div>
  );
}

function AbilityCard({
  k,
  name,
  accent,
  ult,
}: {
  k: string;
  name: string;
  accent: string;
  ult?: boolean;
}) {
  return (
    <div
      className="relative p-4 border bg-background/60 overflow-hidden"
      style={{ borderColor: ult ? `${accent}99` : `${accent}44` }}
    >
      <div
        className="absolute -right-8 -top-8 w-20 h-20 rounded-full blur-2xl opacity-25"
        style={{ background: accent }}
      />
      <div className="flex items-center gap-2 mb-2">
        <kbd
          className="relative w-7 h-7 grid place-items-center bg-secondary border font-mono text-xs"
          style={{ borderColor: accent, color: accent }}
        >
          {k}
        </kbd>
        <span
          className="relative text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
          style={ult ? { color: accent } : undefined}
        >
          {ult ? "Ultimate" : "Ability"}
        </span>
      </div>
      <div className="relative font-bold">{name}</div>
    </div>
  );
}

/* ---------- COLLECTION ---------- */
function CollectionPage() {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"All" | (typeof CATEGORIES)[number]>("All");
  const list = useMemo(() => {
    return WEAPONS.filter(
      (w) =>
        (cat === "All" || w.category === cat) && w.name.toLowerCase().includes(q.toLowerCase()),
    );
  }, [q, cat]);

  return (
    <div>
      <PageHeader
        eyebrow="Arsenal"
        title="Коллекция"
        subtitle="13 единиц оружия. Уникальные характеристики и отдача."
      />

      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-64 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск оружия..."
            className="w-full pl-9 pr-3 py-2 bg-card/60 border border-border text-sm focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {(["All", ...CATEGORIES] as const).map((c) => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={`px-3 py-2 text-[10px] font-bold uppercase tracking-widest border transition-colors ${
                cat === c
                  ? "bg-primary/20 border-primary text-foreground"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-primary/50"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {list.map((w) => (
          <WeaponCard key={w.id} w={w} />
        ))}
      </div>
    </div>
  );
}

function WeaponCard({ w }: { w: Weapon }) {
  return (
    <div className="group bg-card/60 backdrop-blur border border-border hover:border-primary/60 p-5 clip-corner transition-all">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {w.category}
          </div>
          <div className="text-xl font-black tracking-tight">{w.name.toUpperCase()}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Credits</div>
          <div className="text-[var(--neon)] font-black">{w.price}</div>
        </div>
      </div>

      <div
        className="h-20 mb-3 border border-border/60 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, rgba(255,255,255,0.02), rgba(80,160,255,0.06))",
        }}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-3/4 h-2 bg-gradient-to-r from-transparent via-primary/40 to-transparent" />
        </div>
        <div className="absolute top-1 left-2 text-[9px] uppercase tracking-widest text-muted-foreground/70">
          3D Preview · soon
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
        <Stat label="DMG" value={w.damage} />
        <Stat label="FIRE" value={w.fireRate.toFixed(1) + "/s"} />
        <Stat label="MAG" value={w.magazine} />
        <Stat label="ACC" value={w.accuracy + "%"} />
        <Stat label="HS" value={"x" + w.hsMul.toFixed(1)} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-1">
      <span className="text-muted-foreground uppercase tracking-widest text-[10px]">{label}</span>
      <span className="font-bold font-mono">{value}</span>
    </div>
  );
}

/* ---------- CAREER ---------- */
function CareerPage({ profile }: { profile: Profile }) {
  const wr = profile.matches > 0 ? Math.round((profile.wins / profile.matches) * 100) : 0;
  const kpm = profile.matches > 0 ? (profile.kills / profile.matches).toFixed(1) : "—";
  return (
    <div>
      <PageHeader eyebrow="Player" title="Карьера" subtitle="История выступлений и текущий ранг." />

      <div className="grid md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Матчей" value={profile.matches} />
        <StatCard label="Побед" value={profile.wins} />
        <StatCard label="Killов" value={profile.kills} />
        <StatCard label="Win Rate" value={wr + "%"} highlight />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-card/60 backdrop-blur border border-border p-6 clip-corner">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
            Текущий ранг
          </div>
          <div className="text-4xl font-black text-primary text-glow-primary">{profile.rank}</div>
          <div className="mt-4 text-sm text-muted-foreground">
            Сыграй рейтинговый матч, чтобы продвинуться. Текущий уровень: {profile.level}.
          </div>
        </div>
        <div className="bg-card/60 backdrop-blur border border-border p-6 clip-corner">
          <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-2">
            K / Match
          </div>
          <div className="text-4xl font-black text-[var(--neon)] text-glow-neon">{kpm}</div>
          <div className="mt-4 text-sm text-muted-foreground">
            Средние фраги за матч. Цель: 15+ для топ-перформанса.
          </div>
        </div>
      </div>

      <div className="mt-8 bg-card/60 backdrop-blur border border-border clip-corner">
        <div className="px-5 py-3 border-b border-border flex items-center justify-between">
          <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
            История матчей
          </div>
          <div className="text-[10px] text-muted-foreground">last 5</div>
        </div>
        <div className="divide-y divide-border">
          {profile.matches === 0 && (
            <div className="px-5 py-8 text-center text-sm text-muted-foreground">
              Ты ещё не играл матчей. Запусти один из режимов на странице «Играть».
            </div>
          )}
          {profile.matches > 0 &&
            [...Array(Math.min(5, profile.matches))].map((_, i) => (
              <div key={i} className="px-5 py-3 flex items-center gap-4 text-sm">
                <span
                  className={`text-xs font-bold uppercase tracking-widest ${i % 2 ? "text-[var(--neon)]" : "text-destructive"}`}
                >
                  {i % 2 ? "Win" : "Loss"}
                </span>
                <span className="text-muted-foreground">Quick Play</span>
                <span className="ml-auto font-mono text-foreground">
                  {13 + i}/{10 - i}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- STORE ---------- */
function StorePage() {
  const featured = WEAPONS.slice(0, 4);
  return (
    <div>
      <PageHeader
        eyebrow="Shop"
        title="Магазин"
        subtitle="Ежедневная ротация скинов и аксессуаров."
      />
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
        {featured.map((w, i) => (
          <div key={w.id} className="bg-card/60 backdrop-blur border border-border p-4 clip-corner">
            <div
              className="h-32 mb-3 border border-border/40"
              style={{
                background:
                  i % 2
                    ? "linear-gradient(135deg, #1a0c3a 0%, #ff2cb4 100%)"
                    : "linear-gradient(135deg, #06243a 0%, #2dd4ff 100%)",
              }}
            />
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              {w.category} · Skin
            </div>
            <div className="font-black tracking-tight">{w.name.toUpperCase()} · NEON</div>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[var(--neon)] font-black">
                {(w.price * 4).toLocaleString()} VP
              </span>
              <button className="px-3 py-1 text-[10px] font-bold uppercase tracking-widest border border-primary text-primary hover:bg-primary/10">
                Купить
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-card/60 border border-border p-6 clip-corner text-sm text-muted-foreground">
        Полноценный магазин с предпросмотром 3D-моделей и валютой появится в следующих обновлениях.
      </div>
    </div>
  );
}

/* ---------- BATTLE PASS ---------- */
function BattlepassPage({ profile }: { profile: Profile }) {
  const tier = Math.min(50, Math.max(1, profile.level));
  return (
    <div>
      <PageHeader
        eyebrow="Season 1"
        title="Battle Pass · Ignition"
        subtitle="50 уровней наград. Бесплатный и Премиум треки."
      />

      <div className="bg-card/60 backdrop-blur border border-border p-6 mb-6 clip-corner">
        <div className="flex justify-between items-end mb-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              Текущий тир
            </div>
            <div className="text-4xl font-black text-primary text-glow-primary">{tier} / 50</div>
          </div>
          <button className="px-5 py-2 bg-gradient-to-r from-primary to-[var(--neon-pink)] text-primary-foreground font-bold uppercase tracking-widest text-sm clip-corner">
            Активировать Premium
          </button>
        </div>
        <div className="h-1.5 bg-secondary border border-border overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary via-[var(--neon)] to-[var(--neon-pink)]"
            style={{ width: `${(tier / 50) * 100}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
        {Array.from({ length: 20 }).map((_, i) => {
          const t = i + 1;
          const unlocked = t <= tier;
          const isUlt = t % 5 === 0;
          return (
            <div
              key={i}
              className={`relative aspect-square border ${
                unlocked
                  ? isUlt
                    ? "border-[var(--neon-pink)] bg-[var(--neon-pink)]/10"
                    : "border-[var(--neon)] bg-[var(--neon)]/10"
                  : "border-border bg-card/40"
              } flex flex-col items-center justify-center clip-corner`}
            >
              <div
                className={`text-[10px] uppercase tracking-widest ${unlocked ? "text-foreground" : "text-muted-foreground"}`}
              >
                T{t}
              </div>
              {isUlt ? (
                <Trophy
                  className={`w-5 h-5 ${unlocked ? "text-[var(--neon-pink)]" : "text-muted-foreground"}`}
                />
              ) : (
                <Package
                  className={`w-5 h-5 ${unlocked ? "text-[var(--neon)]" : "text-muted-foreground"}`}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- SETTINGS PAGE ---------- */
function SettingsPage({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  return (
    <div className="max-w-3xl">
      <PageHeader
        eyebrow="System"
        title="Настройки"
        subtitle="Чувствительность, поле зрения и графика."
      />

      <div className="space-y-6">
        <Panel icon={<Crosshair className="w-4 h-4" />} title="Прицеливание">
          <SliderRow
            label="Чувствительность мыши"
            value={settings.sensitivity}
            min={0.1}
            max={5}
            step={0.05}
            display={settings.sensitivity.toFixed(2)}
            onChange={(v) => onChange({ ...settings, sensitivity: v })}
          />
          <SliderRow
            label="Поле зрения (FOV)"
            value={settings.fov}
            min={60}
            max={110}
            step={1}
            display={`${settings.fov}°`}
            onChange={(v) => onChange({ ...settings, fov: v })}
          />
        </Panel>

        <Panel icon={<Monitor className="w-4 h-4" />} title="Графика">
          <div>
            <div className="flex justify-between mb-2">
              <span className="text-sm font-bold">Качество графики</span>
              <span className="text-xs text-muted-foreground uppercase">{settings.graphics}</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(["low", "medium", "high"] as const).map((g) => (
                <button
                  key={g}
                  onClick={() => onChange({ ...settings, graphics: g })}
                  className={`py-2 border text-sm font-bold uppercase tracking-wider transition-all ${
                    settings.graphics === g
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary border-border hover:border-[var(--neon)]"
                  }`}
                >
                  {g === "low" ? "Низк." : g === "medium" ? "Сред." : "Выс."}
                </button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              Влияет на pixel ratio, сглаживание и дальность тумана. Применяется при следующем
              матче.
            </p>
          </div>
        </Panel>

        <Panel icon={<Volume2 className="w-4 h-4" />} title="Звук">
          <p className="text-sm text-muted-foreground">
            Звуковая система (ElevenLabs) подключена. Реалистичные выстрелы, шаги и ульты появятся в
            следующем обновлении.
          </p>
        </Panel>

        <button
          onClick={() => onChange({ ...DEFAULT_SETTINGS })}
          className="w-full py-3 border border-border bg-card/60 hover:bg-card hover:border-destructive/60 text-sm uppercase tracking-widest transition-colors"
        >
          Сбросить по умолчанию
        </button>
      </div>
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card/60 backdrop-blur border border-border clip-corner">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2 text-primary">
        {icon}
        <span className="text-xs uppercase tracking-[0.3em] font-bold">{title}</span>
      </div>
      <div className="p-5 space-y-5">{children}</div>
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between mb-2">
        <span className="text-sm font-bold">{label}</span>
        <span className="text-sm text-[var(--neon)] font-mono">{display}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[color:var(--neon)]"
      />
    </div>
  );
}

/* ---------- shared bits ---------- */
function PageHeader({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mb-8">
      <div className="text-[10px] uppercase tracking-[0.4em] text-[var(--neon)] mb-1">
        {eyebrow}
      </div>
      <h1 className="text-4xl md:text-5xl font-black tracking-tight">{title.toUpperCase()}</h1>
      <p className="text-muted-foreground mt-2">{subtitle}</p>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-lg font-black uppercase tracking-widest">{title}</h2>
      {hint && (
        <span className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}

function KeyRow({ k, label }: { k: string; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <kbd className="px-2 py-1 bg-secondary border border-border text-foreground font-mono text-xs min-w-14 text-center">
        {k}
      </kbd>
      <span>{label}</span>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number | string;
  highlight?: boolean;
}) {
  return (
    <div className="bg-card/60 backdrop-blur border border-border p-5 clip-corner">
      <div className="text-[10px] text-muted-foreground uppercase tracking-[0.3em]">{label}</div>
      <div
        className={`text-3xl font-black ${highlight ? "text-[var(--neon)] text-glow-neon" : "text-primary"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ModeCard({
  tag,
  title,
  subtitle,
  details,
  icon,
  variant,
  onClick,
  locked,
  lockHint,
}: {
  tag: string;
  title: string;
  subtitle: string;
  details: string;
  icon: React.ReactNode;
  variant: "primary" | "accent" | "pink";
  onClick: () => void;
  locked?: boolean;
  lockHint?: string;
}) {
  const colorMap = {
    primary: "border-primary/40 hover:border-primary text-primary",
    accent: "border-[var(--neon)]/40 hover:border-[var(--neon)] text-[var(--neon)]",
    pink: "border-[var(--neon-pink)]/40 hover:border-[var(--neon-pink)] text-[var(--neon-pink)]",
  };
  return (
    <button
      onClick={onClick}
      disabled={locked}
      className={`group relative text-left bg-card/70 backdrop-blur border-2 ${colorMap[variant]} clip-corner p-6 transition-all overflow-hidden ${
        locked ? "opacity-60 cursor-not-allowed" : "hover:scale-[1.015] hover:shadow-2xl"
      }`}
    >
      <div className="absolute top-3 right-4 text-5xl font-black opacity-10 group-hover:opacity-20 transition-opacity">
        {tag}
      </div>
      <div className="mb-4 relative">{icon}</div>
      <div className="text-xl font-black text-foreground mb-1 uppercase tracking-wide">{title}</div>
      <div className="text-sm text-muted-foreground mb-4">{subtitle}</div>
      <div className="text-[11px] text-muted-foreground border-t border-border pt-3 uppercase tracking-widest">
        {details}
      </div>
      {!locked ? (
        <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.3em]">
          <Play className="w-3 h-3 fill-current" /> Играть
        </div>
      ) : (
        <div className="mt-4 inline-flex items-center gap-1.5 text-xs font-black text-destructive uppercase tracking-widest">
          <Lock className="w-3 h-3" /> {lockHint}
        </div>
      )}
    </button>
  );
}
