// Client-side cache for agent voice lines. Hits the server route which calls ElevenLabs.
import type { Agent, AgentVoiceLines } from "@/game/data/agents";

type LineKey = keyof AgentVoiceLines;

const cache = new Map<string, string>(); // key -> blob URL
const inFlight = new Map<string, Promise<string>>();

let muted = false;
let volume = 0.85;

export function setVoiceMuted(v: boolean) { muted = v; }
export function setVoiceVolume(v: number) { volume = Math.max(0, Math.min(1, v)); }
export function isVoiceMuted() { return muted; }

async function fetchLine(agent: Agent, key: LineKey): Promise<string> {
  const k = `${agent.id}::${key}`;
  const cached = cache.get(k);
  if (cached) return cached;
  const existing = inFlight.get(k);
  if (existing) return existing;

  const p = (async () => {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voiceId: agent.voiceId, text: agent.lines[key] }),
    });
    if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
    // Server returns JSON when the upstream provider is unavailable — skip silently.
    const ctype = res.headers.get("Content-Type") || "";
    if (ctype.includes("application/json")) {
      throw new Error("TTS unavailable (fallback)");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    cache.set(k, url);
    return url;
  })().finally(() => inFlight.delete(k));

  inFlight.set(k, p);
  return p;
}

/** Play one of the agent's pre-defined lines. Safe to call even before TTS finishes. */
export async function playAgentLine(agent: Agent, key: LineKey): Promise<void> {
  if (muted) return;
  try {
    const url = await fetchLine(agent, key);
    const audio = new Audio(url);
    audio.volume = volume;
    audio.play().catch(() => {});
  } catch (e) {
    // Silently swallow — voice is non-critical
    console.warn("Voice line failed", e);
  }
}

/** Eagerly warm the cache for the agent's lines so first-event playback is instant. */
export function prefetchAgentLines(agent: Agent) {
  const keys: LineKey[] = ["select", "respawn", "kill", "victory", "defeat"];
  for (const k of keys) fetchLine(agent, k).catch(() => {});
}
