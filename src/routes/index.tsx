import { createFileRoute } from "@tanstack/react-router";
import { App } from "@/game/App";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Force One — 3D Tactical FPS" },
      {
        name: "description",
        content:
          "Force One — 3D тактический шутер: быстрая игра, безранговый и рейтинговый режим. Стрельба, способности, уровни.",
      },
      { property: "og:title", content: "Force One" },
      {
        property: "og:description",
        content: "Force One — 3D шутер с режимами матчей и прокачкой.",
      },
    ],
  }),
  component: () => <App />,
});
