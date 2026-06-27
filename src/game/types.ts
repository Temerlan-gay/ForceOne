import * as THREE from "three";
import type { Agent } from "@/game/data/agents";
import type { SiteKey } from "@/game/data/maps";
import type { ServerRegionId } from "@/game/data/regions";

export type MatchMode = "quick" | "unranked" | "ranked";

export type MapTheme = "desert" | "arctic" | "temple" | "urban" | "neon";
export type TimeOfDay = "day" | "evening" | "night";

export type GameConfig = {
  mode: MatchMode;
  killsToWin: number;
  botCount: number;
  multiplayer?: boolean;
  room?: string;
  regionId?: ServerRegionId;
  playerName?: string;
  mapId?: string;
  mapTheme?: MapTheme;
  timeOfDay?: TimeOfDay;
  dynamicCycle?: boolean;
  agent?: Agent;
};

export type AbilityKey = "c" | "q" | "e" | "x";
export type Ability = {
  name: string;
  charges: number;
  max: number;
  cd: number;
  cooldown: number;
};

export type Bot = {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  hp: number;
  armor: number;
  alive: boolean;
  fireCd: number;
  target: THREE.Vector3;
  retargetIn: number;
  flashed: number;
};

export type Tracer = {
  line: THREE.Line;
  life: number;
};

export type SmokeOrb = { mesh: THREE.Mesh; life: number; pos: THREE.Vector3; r: number };

export type ObjectiveState = {
  carryingPack: boolean;
  canPlant: boolean;
  site: SiteKey | null;
  phase: "carried" | "planting" | "planted" | "detonated";
  plantProgress: number;
  plantDuration: number;
  timeLeft: number;
  detonateAfter: number;
};

export type RunState = {
  mode: MatchMode;
  killsToWin: number;
  hp: number;
  armor: number;
  mag: number;
  ammo: number;
  reloading: number;
  fireCd: number;
  spread: number;
  kills: number;
  deaths: number;
  flashed: number;
  abilities: Record<AbilityKey, Ability>;
  finished: boolean;
  won: boolean;
  message: string;
  msgTimer: number;
  onlinePlayers: number;
  objective: ObjectiveState;
  equippedSlot: 1 | 2 | 3 | 4;
  equippedName: string;
};

export function makeRun(cfg: GameConfig): RunState {
  const agent = cfg.agent;
  const controllerSmoke = agent?.role === "Controller";
  const fastDuelist = agent?.id === "volt" || agent?.id === "phoenix";

  return {
    mode: cfg.mode,
    killsToWin: cfg.killsToWin,
    hp: 100,
    armor: 50,
    mag: 25,
    ammo: 90,
    reloading: 0,
    fireCd: 0,
    spread: 0,
    kills: 0,
    deaths: 0,
    flashed: 0,
    abilities: {
      c: {
        name: agent?.abilities.c ?? "Frag",
        charges: agent?.role === "Duelist" ? 2 : 1,
        max: agent?.role === "Duelist" ? 2 : 1,
        cd: 0,
        cooldown: agent?.role === "Duelist" ? 10 : 16,
      },
      q: {
        name: agent?.abilities.q ?? "Flash",
        charges: agent?.role === "Initiator" ? 2 : 1,
        max: agent?.role === "Initiator" ? 2 : 1,
        cd: 0,
        cooldown: agent?.role === "Initiator" ? 9 : 12,
      },
      e: {
        name: agent?.abilities.e ?? "Dash",
        charges: fastDuelist ? 2 : 1,
        max: fastDuelist ? 2 : 1,
        cd: 0,
        cooldown: fastDuelist ? 6 : 11,
      },
      x: {
        name: agent?.abilities.ult ?? "Smoke",
        charges: 1,
        max: 1,
        cd: 0,
        cooldown: controllerSmoke ? 18 : 22,
      },
    },
    finished: false,
    won: false,
    message: "",
    msgTimer: 0,
    onlinePlayers: 0,
    objective: {
      carryingPack: true,
      canPlant: false,
      site: null,
      phase: "carried",
      plantProgress: 0,
      plantDuration: 3,
      timeLeft: 40,
      detonateAfter: 40,
    },
    equippedSlot: 2,
    equippedName: "Falcon",
  };
}
