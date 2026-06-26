/** Competitive round-based match state (Valorant-style, simplified). */

export type RoundPhase = "buy" | "live" | "end" | "match-end";
export type MatchSide = "attack" | "defense";

export type KillFeedEntry = {
  id: number;
  killer: string;
  victim: string;
  /** Color used for the killer's name. */
  hue: string;
  ts: number;
  headshot?: boolean;
};

export type RoundConfig = {
  /** Seconds in the buy phase before each round. */
  buySec: number;
  /** Seconds the live round lasts before timing out. */
  liveSec: number;
  /** Seconds shown on the round-end banner. */
  endSec: number;
  /** Kills the player needs to win a round. */
  killTarget: number;
  /** Max rounds played (e.g. first-to-N format). */
  maxRounds: number;
  /** Rounds needed to win the match. */
  toWin: number;
};

export const ROUND_CONFIG: RoundConfig = {
  buySec: 8,
  liveSec: 100,
  endSec: 5,
  killTarget: 3,
  maxRounds: 7,
  toWin: 4,
};

export type RoundState = {
  phase: RoundPhase;
  round: number;
  score: { you: number; enemy: number };
  /** Per-round running tally for kill-feed/MVP calculations. */
  roundKills: number;
  roundDeaths: number;
  /** Cumulative match totals. */
  totalKills: number;
  totalDeaths: number;
  /** Best round kill count so far (for MVP banner). */
  bestRoundKills: number;
  /** Performance.now() at which the current phase will auto-advance. */
  phaseEndAt: number;
  lastRoundResult?: "won" | "lost";
  matchWon?: boolean;
};

export function createInitialRound(): RoundState {
  return {
    phase: "buy",
    round: 1,
    score: { you: 0, enemy: 0 },
    roundKills: 0,
    roundDeaths: 0,
    totalKills: 0,
    totalDeaths: 0,
    bestRoundKills: 0,
    phaseEndAt: performance.now() + ROUND_CONFIG.buySec * 1000,
  };
}

export function phaseLabel(p: RoundPhase): string {
  switch (p) {
    case "buy":
      return "Buy Phase";
    case "live":
      return "Round Live";
    case "end":
      return "Round Over";
    case "match-end":
      return "Match";
  }
}
