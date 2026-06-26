import neonCityImg from "@/assets/map-neon-city.jpg";

export type MapTheme = "desert" | "arctic" | "temple" | "urban" | "neon";
export type TimeOfDay = "day" | "evening" | "night";

export type SiteInfo = {
  /** "A" or "B" */
  key: "A" | "B";
  name: string;
  description: string;
};

export type GameMap = {
  id: string;
  name: string;
  /** Short subtitle shown under the name */
  tagline: string;
  /** 2-3 sentence lore for map reveal screen */
  lore: string;
  /** Visual theme used by the 3D engine */
  theme: MapTheme;
  /** Time of day used for ambient lighting / sky */
  timeOfDay: TimeOfDay;
  /** When true, the engine cycles day → evening → night during the match */
  dynamicCycle?: boolean;
  /** Bomb sites for competitive layout */
  sites: [SiteInfo, SiteInfo];
  /** Key environmental design notes */
  designNotes: string[];
  /** CSS gradient string used as preview backdrop fallback */
  preview: string;
  /** Optional preview screenshot */
  image?: string;
};

export const MAPS: GameMap[] = [
  {
    id: "dunefall",
    name: "Dunefall",
    tagline: "Пустынная военная зона · день",
    lore:
      "После глобальных конфликтов корпорации построили скрытую базу в пустыне " +
      "для разработки оружия нового поколения. После утечки данных база стала " +
      "зоной боевых операций.",
    theme: "desert",
    timeOfDay: "day",
    designNotes: ["песчаные бури", "разрушенные ангары", "подземные туннели"],
    sites: [
      {
        key: "A",
        name: "Командный центр",
        description: "Разрушенный CC, узкие проходы и много укрытий.",
      },
      {
        key: "B",
        name: "Контейнерный двор",
        description: "Открытая зона с башнями и снайперскими позициями.",
      },
    ],
    preview: "linear-gradient(135deg, #d9a066 0%, #b07a3a 55%, #5a3a1c 100%)",
  },
  {
    id: "ironhaven",
    name: "Ironhaven",
    tagline: "Индустриальный завод · вечер",
    lore:
      "Огромный автоматизированный завод по производству военных дронов вышел " +
      "из-под контроля ИИ и стал ареной боевых операций между корпоративными " +
      "наёмниками.",
    theme: "urban",
    timeOfDay: "evening",
    designNotes: ["металл, трубы, пар", "движущиеся механизмы", "шумящие конвейеры"],
    sites: [
      { key: "A", name: "Фабрика", description: "Вертикальные уровни, мостики и галереи." },
      { key: "B", name: "Склад", description: "Кран и контейнеры, открытые линии огня." },
    ],
    preview: "linear-gradient(135deg, #7a7d84 0%, #3a3e48 55%, #15181f 100%)",
  },
  {
    id: "neon_district",
    name: "Neon District",
    tagline: "Киберпанк-город · ночь",
    lore:
      "Город будущего разделён между корпорациями, каждая контролирует " +
      "цифровую инфраструктуру и наёмников. Улицы залиты дождём и неоном — " +
      "идеальная сцена для тихой войны.",
    theme: "neon",
    timeOfDay: "night",
    designNotes: ["неоновые вывески", "дождь и отражения", "высокие здания"],
    sites: [
      {
        key: "A",
        name: "Plaza",
        description: "Торговый центр с голограммами, лестницы и закрытые залы.",
      },
      { key: "B", name: "Skyline", description: "Крыши небоскрёбов и длинные линии обзора." },
    ],
    preview: "linear-gradient(135deg, #0a0e2c 0%, #1d2670 40%, #ff2cb4 100%)",
    image: neonCityImg,
  },
  {
    id: "frostline",
    name: "Frostline",
    tagline: "Арктическая научная база · день",
    lore:
      "Исследовательская станция изучала энергетический кристалл, но после " +
      "аварии база была эвакуирована, оставив технологии под контролем " +
      "автоматических систем безопасности.",
    theme: "arctic",
    timeOfDay: "day",
    designNotes: ["снег, лёд, метели", "стеклянные лаборатории", "холодное освещение"],
    sites: [
      {
        key: "A",
        name: "Купол-лаборатория",
        description: "Узкие коридоры внутри исследовательского купола.",
      },
      {
        key: "B",
        name: "Внешний периметр",
        description: "Открытая зона со снежной бурей и плохой видимостью.",
      },
    ],
    preview: "linear-gradient(135deg, #cfe6f2 0%, #6f99b8 55%, #1f3a55 100%)",
  },
  {
    id: "temple_core",
    name: "Temple Core",
    tagline: "Древние руины + технологии · день→ночь",
    lore:
      "Древний храм скрывал энергетическое ядро неизвестного происхождения. " +
      "Современные корпорации начали раскопки и превратили святилище в " +
      "боевую зону, где древнее встречается с футуризмом.",
    theme: "temple",
    timeOfDay: "day",
    dynamicCycle: true,
    designNotes: [
      "каменные руины + голограммы",
      "энергия в центре карты",
      "смесь древнего и футуризма",
    ],
    sites: [
      { key: "A", name: "Внутренний храм", description: "Узкие коридоры и арки внутри святилища." },
      {
        key: "B",
        name: "Двор ядра",
        description: "Открытый двор с энергетическим ядром в центре.",
      },
    ],
    preview: "linear-gradient(135deg, #4a6b3a 0%, #2f4a25 55%, #18271a 100%)",
  },
];
