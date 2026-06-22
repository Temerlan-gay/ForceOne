import { supabase } from "@/integrations/supabase/client";

export type RemotePlayer = {
  id: string;
  x: number;
  z: number;
  yaw: number;
  name: string;
  t: number;
};

/**
 * Lightweight realtime multiplayer over Supabase broadcast.
 * Players in the same `room` see each other as avatars in the 3D world.
 * No server logic — pure peer broadcast of position/rotation.
 */
export class Multiplayer {
  private channel: ReturnType<typeof supabase.channel> | null = null;
  private id = Math.random().toString(36).slice(2, 10);
  remotes = new Map<string, RemotePlayer>();
  onChange?: () => void;
  private lastSent = 0;

  constructor(private room: string, private name: string) {}

  get selfId() { return this.id; }

  start() {
    const ch = supabase.channel(`force-one:${this.room}`, {
      config: { broadcast: { self: false, ack: false } },
    });
    ch.on("broadcast", { event: "pos" }, ({ payload }) => {
      const p = payload as Omit<RemotePlayer, "t">;
      if (!p || p.id === this.id) return;
      this.remotes.set(p.id, { ...p, t: performance.now() });
      this.onChange?.();
    });
    ch.on("broadcast", { event: "bye" }, ({ payload }) => {
      const id = (payload as { id: string })?.id;
      if (!id) return;
      this.remotes.delete(id);
      this.onChange?.();
    });
    ch.subscribe();
    this.channel = ch;
  }

  tick(x: number, z: number, yaw: number) {
    const now = performance.now();
    if (now - this.lastSent > 80 && this.channel) {
      this.lastSent = now;
      this.channel.send({
        type: "broadcast",
        event: "pos",
        payload: { id: this.id, name: this.name, x, z, yaw },
      });
    }
    // prune stale remotes (5s without update)
    let pruned = false;
    for (const [id, p] of this.remotes) {
      if (now - p.t > 5000) { this.remotes.delete(id); pruned = true; }
    }
    if (pruned) this.onChange?.();
  }

  stop() {
    if (this.channel) {
      this.channel.send({ type: "broadcast", event: "bye", payload: { id: this.id } });
      supabase.removeChannel(this.channel);
    }
    this.channel = null;
  }
}
