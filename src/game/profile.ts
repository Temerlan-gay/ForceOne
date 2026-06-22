// Player progression. When a user is signed in, kept in Supabase `profiles`.
// Falls back to localStorage for anonymous play.
import { supabase } from "@/integrations/supabase/client";

const KEY = "force_one_profile_v2";

export type Profile = {
  username: string;
  avatar_color: string;
  level: number;
  xp: number;
  matches: number;
  wins: number;
  kills: number;
  deaths: number;
  rank: string;
};

const RANKS = ["Iron 1", "Bronze 1", "Silver 1", "Gold 1", "Platinum 1", "Diamond 1", "Ascendant 1", "Immortal 1", "Radiant"];

const DEFAULT: Profile = {
  username: "Operator",
  avatar_color: "#22ddee",
  level: 1, xp: 0, matches: 0, wins: 0, kills: 0, deaths: 0, rank: "Unranked",
};

export function loadProfile(): Profile {
  if (typeof window === "undefined") return { ...DEFAULT };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { return { ...DEFAULT }; }
}

export function saveProfile(p: Profile) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch {}
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("username, avatar_color, level, xp, kills, deaths, wins, matches, rank")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return { ...DEFAULT, ...data };
}

export async function syncProfile(userId: string, p: Profile) {
  // Don't push username (set by trigger from email) — only progression fields
  await supabase
    .from("profiles")
    .update({
      avatar_color: p.avatar_color,
      level: p.level,
      xp: p.xp,
      kills: p.kills,
      deaths: p.deaths,
      wins: p.wins,
      matches: p.matches,
      rank: p.rank,
    })
    .eq("id", userId);
}

export function xpForLevel(lvl: number) {
  return 100 + lvl * 50;
}

export function addMatchResult(p: Profile, opts: { won: boolean; kills: number; deaths?: number; mode: "quick" | "unranked" | "ranked" }): Profile {
  const next = { ...p };
  next.matches++;
  next.kills += opts.kills;
  next.deaths += opts.deaths ?? 0;
  if (opts.won) next.wins++;
  const gain = (opts.won ? 200 : 100) + opts.kills * 15 + (opts.mode === "ranked" ? 100 : opts.mode === "unranked" ? 50 : 0);
  next.xp += gain;
  while (next.xp >= xpForLevel(next.level)) {
    next.xp -= xpForLevel(next.level);
    next.level++;
  }
  if (opts.mode === "ranked") {
    const idx = Math.min(RANKS.length - 1, Math.floor((next.wins) / 3));
    next.rank = RANKS[idx];
  }
  saveProfile(next);
  return next;
}

export const RANK_LIST = RANKS;
