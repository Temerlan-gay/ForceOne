import * as THREE from "three";
import type { Agent } from "@/game/data/agents";

export type MatchMode = "quick" | "unranked" | "ranked";

export type MapTheme = "desert" | "arctic" | "temple" | "urban" | "neon";
export type TimeOfDay = "day" | "evening" | "night";

export type GameConfig = {
  mode: MatchMode;
  killsToWin: number;
  botCount: number;
  multiplayer?: boolean;
  room?: string;
  playerName?: string;
  mapId?: string;
  mapTheme?: MapTheme;
  timeOfDay?: TimeOfDay;
  dynamicCycle?: boolean;
  agent?: Agent;
};

export type AbilityKey = "q" | "e" | "x";
export type Ability = { name: string; charges: number; max: number; cd: number; cooldown: number };

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
};

export function makeRun(cfg: GameConfig): RunState {
  return {
    mode: cfg.mode,
    killsToWin: cfg.killsToWin,
    hp: 100, armor: 50, mag: 25, ammo: 90, reloading: 0,
    fireCd: 0, spread: 0, kills: 0, deaths: 0, flashed: 0,
    abilities: {
      q: { name: "Flash", charges: 2, max: 2, cd: 0, cooldown: 9 },
      e: { name: "Dash", charges: 1, max: 1, cd: 0, cooldown: 7 },
      x: { name: "Smoke", charges: 2, max: 2, cd: 0, cooldown: 12 },
    },
    finished: false, won: false, message: "", msgTimer: 0,
    onlinePlayers: 0,
  };
}
