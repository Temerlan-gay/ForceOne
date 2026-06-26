// Client-side cache for agent voice lines. Hits the server route which calls ElevenLabs.
import type { Agent, AgentVoiceLines } from "@/game/data/agents";

type LineKey = keyof AgentVoiceLines;

const cache = new Map<string, string>(); // key -> blob URL
const inFlight = new Map<string, Promise<string>>();

let muted = false;
let volume = 0.85;
let audioContext: AudioContext | null = null;

export function setVoiceMuted(v: boolean) {
  muted = v;
}
export function setVoiceVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
}
export function isVoiceMuted() {
  return muted;
}

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
      body: JSON.stringify({
        voiceId: agent.voiceId,
        text: prepareLine(agent.lines[key], key),
        lineKey: key,
      }),
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

function prepareLine(text: string, key: LineKey) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (key === "kill") return `${cleaned}.`;
  if (key === "victory") return `${cleaned}!`;
  if (key === "defeat") return `${cleaned}...`;
  return cleaned;
}

function getAudioContext() {
  const AudioCtor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtor) return null;
  audioContext ??= new AudioCtor();
  return audioContext;
}

function playProcessedAudio(url: string) {
  const audio = new Audio(url);
  audio.volume = volume;
  audio.playbackRate = 0.985 + Math.random() * 0.03;
  audio.preservesPitch = true;

  const ctx = getAudioContext();
  if (!ctx) return audio.play().catch(() => {});

  const source = ctx.createMediaElementSource(audio);
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -24;
  compressor.knee.value = 22;
  compressor.ratio.value = 3.2;
  compressor.attack.value = 0.006;
  compressor.release.value = 0.18;

  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume)) * 0.98;
  source.connect(compressor);
  compressor.connect(gain);
  gain.connect(ctx.destination);

  return ctx
    .resume()
    .then(() => audio.play())
    .catch(() => {});
}

/** Play one of the agent's pre-defined lines. Safe to call even before TTS finishes. */
export async function playAgentLine(agent: Agent, key: LineKey): Promise<void> {
  if (muted) return;
  try {
    const url = await fetchLine(agent, key);
    playProcessedAudio(url);
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
