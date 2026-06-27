import neonCityImg from "@/assets/map-neon-city.jpg";

export type MapTheme = "desert" | "arctic" | "temple" | "urban" | "neon";
export type TimeOfDay = "day" | "evening" | "night";
export type SiteKey = "A" | "B" | "C";

export type SiteInfo = {
  key: SiteKey;
  name: string;
  description: string;
};

export type MapPoint = {
  x: number;
  z: number;
};

export type MapSiteLayout = SiteInfo &
  MapPoint & {
    radius: number;
  };

export type MapLayout = {
  halfSize: number;
  attackerSpawn: MapPoint;
  defenderSpawn: MapPoint;
  mid?: MapPoint & { name: string };
  sites: [MapSiteLayout, MapSiteLayout] | [MapSiteLayout, MapSiteLayout, MapSiteLayout];
};

export type GameMap = {
  id: string;
  name: string;
  tagline: string;
  lore: string;
  theme: MapTheme;
  timeOfDay: TimeOfDay;
  dynamicCycle?: boolean;
  sites: [SiteInfo, SiteInfo] | [SiteInfo, SiteInfo, SiteInfo];
  layout: MapLayout;
  designNotes: string[];
  preview: string;
  image?: string;
};

const twoSiteLayout = (
  a: Omit<MapSiteLayout, "key">,
  b: Omit<MapSiteLayout, "key">,
  mid: MapPoint & { name: string },
  halfSize = 60,
): MapLayout => ({
  halfSize,
  attackerSpawn: { x: 0, z: halfSize - 8 },
  defenderSpawn: { x: 0, z: -halfSize + 8 },
  mid,
  sites: [
    { key: "A", ...a },
    { key: "B", ...b },
  ],
});

const threeSiteLayout = (
  a: Omit<MapSiteLayout, "key">,
  b: Omit<MapSiteLayout, "key">,
  c: Omit<MapSiteLayout, "key">,
  halfSize = 64,
): MapLayout => ({
  halfSize,
  attackerSpawn: { x: 0, z: halfSize - 8 },
  defenderSpawn: { x: 0, z: -halfSize + 8 },
  sites: [
    { key: "A", ...a },
    { key: "B", ...b },
    { key: "C", ...c },
  ],
});

export const MAPS: GameMap[] = [
  {
    id: "dunefall",
    name: "Dunefall",
    tagline: "Desert military zone - day",
    lore:
      "A buried weapons base split into long sand lanes, hard cover and a contested center route.",
    theme: "desert",
    timeOfDay: "day",
    designNotes: ["sand lanes", "broken hangars", "underground routes"],
    sites: [
      {
        key: "A",
        name: "Plant A",
        description: "Command center site with tight entrances and heavy cover.",
      },
      {
        key: "B",
        name: "Plant B",
        description: "Container yard with open angles and sniper sightlines.",
      },
    ],
    layout: twoSiteLayout(
      { name: "Plant A", description: "Command center", x: -38, z: -28, radius: 7 },
      { name: "Plant B", description: "Container yard", x: 36, z: -22, radius: 7 },
      { name: "Mid", x: -4, z: 2 },
      64,
    ),
    preview: "linear-gradient(135deg, #d9a066 0%, #b07a3a 55%, #5a3a1c 100%)",
  },
  {
    id: "ironhaven",
    name: "Ironhaven",
    tagline: "Industrial factory - evening",
    lore: "A drone factory with metal catwalks, crate stacks and a noisy middle lane.",
    theme: "urban",
    timeOfDay: "evening",
    designNotes: ["metal", "pipes", "conveyors"],
    sites: [
      { key: "A", name: "Plant A", description: "Factory floor with vertical cover." },
      { key: "B", name: "Plant B", description: "Warehouse site with cranes and containers." },
    ],
    layout: twoSiteLayout(
      { name: "Plant A", description: "Factory floor", x: -44, z: -24, radius: 7 },
      { name: "Plant B", description: "Warehouse", x: 38, z: -8, radius: 7 },
      { name: "Mid", x: 5, z: 5 },
      70,
    ),
    preview: "linear-gradient(135deg, #7a7d84 0%, #3a3e48 55%, #15181f 100%)",
  },
  {
    id: "neon_district",
    name: "Neon District",
    tagline: "Cyberpunk city - night - 3 sites",
    lore: "Rain, neon and rooftops create a fast three-site map with no dedicated mid lane.",
    theme: "neon",
    timeOfDay: "night",
    designNotes: ["neon signs", "rain reflections", "three plant sites"],
    sites: [
      { key: "A", name: "Plant A", description: "Plaza site with holograms and stairs." },
      { key: "B", name: "Plant B", description: "Skyline site with long rooftop angles." },
      { key: "C", name: "Plant C", description: "Arcade site with short corners and glass cover." },
    ],
    layout: threeSiteLayout(
      { name: "Plant A", description: "Plaza", x: -42, z: -25, radius: 6.5 },
      { name: "Plant B", description: "Skyline", x: 2, z: -40, radius: 6.5 },
      { name: "Plant C", description: "Arcade", x: 43, z: -16, radius: 6.5 },
      68,
    ),
    preview: "linear-gradient(135deg, #0a0e2c 0%, #1d2670 40%, #ff2cb4 100%)",
    image: neonCityImg,
  },
  {
    id: "frostline",
    name: "Frostline",
    tagline: "Arctic research base - day",
    lore: "A frozen lab complex with low visibility outside and tight indoor plant zones.",
    theme: "arctic",
    timeOfDay: "day",
    designNotes: ["snow", "glass labs", "cold lighting"],
    sites: [
      { key: "A", name: "Plant A", description: "Lab dome with narrow corridors." },
      { key: "B", name: "Plant B", description: "Outer perimeter with poor visibility." },
    ],
    layout: twoSiteLayout(
      { name: "Plant A", description: "Lab dome", x: -32, z: -34, radius: 7 },
      { name: "Plant B", description: "Outer perimeter", x: 35, z: -28, radius: 7 },
      { name: "Mid", x: 8, z: -4 },
      60,
    ),
    preview: "linear-gradient(135deg, #cfe6f2 0%, #6f99b8 55%, #1f3a55 100%)",
  },
  {
    id: "temple_core",
    name: "Temple Core",
    tagline: "Ancient ruins + tech - day to night - 3 sites",
    lore: "A three-site temple map where the old mid lane is replaced by Plant C.",
    theme: "temple",
    timeOfDay: "day",
    dynamicCycle: true,
    designNotes: ["stone ruins", "energy core", "three plant sites"],
    sites: [
      { key: "A", name: "Plant A", description: "Inner shrine with arches and tight cover." },
      { key: "B", name: "Plant B", description: "Open core yard with long rotations." },
      { key: "C", name: "Plant C", description: "Lower relic room replacing the mid lane." },
    ],
    layout: threeSiteLayout(
      { name: "Plant A", description: "Inner shrine", x: -44, z: -30, radius: 6.5 },
      { name: "Plant B", description: "Core yard", x: 42, z: -30, radius: 6.5 },
      { name: "Plant C", description: "Relic room", x: -2, z: -8, radius: 6.5 },
      72,
    ),
    preview: "linear-gradient(135deg, #4a6b3a 0%, #2f4a25 55%, #18271a 100%)",
  },
];
