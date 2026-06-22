import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.ELEVENLABS_API_KEY;
        if (!apiKey) {
          return new Response("ElevenLabs is not configured", { status: 503 });
        }
        let body: { voiceId?: string; text?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }
        const voiceId = (body.voiceId || "").trim();
        const text = (body.text || "").trim();
        if (!voiceId || !text) return new Response("voiceId and text required", { status: 400 });
        if (text.length > 400) return new Response("text too long", { status: 400 });

        const upstream = await fetch(
          `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
          {
            method: "POST",
            headers: {
              "xi-api-key": apiKey,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              text,
              model_id: "eleven_multilingual_v2",
              voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.55, use_speaker_boost: true, speed: 1.0 },
            }),
          },
        );

        if (!upstream.ok) {
          const errText = await upstream.text().catch(() => "");
          console.warn("ElevenLabs TTS upstream error", upstream.status, errText);
          // Soft-fail so the client can skip voice without tripping an error boundary
          return new Response(
            JSON.stringify({ error: "TTS_UNAVAILABLE", status: upstream.status, fallback: true }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        const buf = await upstream.arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "Content-Type": "audio/mpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        });
      },
    },
  },
});
