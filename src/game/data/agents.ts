export type AgentRole = "Duelist" | "Controller" | "Sentinel" | "Initiator";

export type AgentSilhouette =
  | "soldier" | "heavy" | "stealth" | "scout" | "mage"
  | "support" | "sniper" | "ninja" | "speedster";

export type AgentVoiceLines = {
  /** Said when player picks the agent in agent-select screen */
  select: string;
  /** Said on respawn */
  respawn: string;
  /** Said when player gets a kill */
  kill: string;
  /** Said on victory screen */
  victory: string;
  /** Said on defeat */
  defeat: string;
};

export type AgentLore = {
  /** Real-name / call-sign details (Valorant-style identity card) */
  realName: string;
  origin: string;
  /** 2-3 sentence backstory in Russian */
  bio: string;
  /** Personality tag for voice tone / lore screens */
  personality: string;
};

export type Agent = {
  id: string;
  name: string;
  role: AgentRole;
  tagline: string;
  abilities: { q: string; e: string; ult: string };
  /** Primary accent color (hex) */
  hue: string;
  /** Decorative tailwind gradient ramp */
  gradient: string;
  /** Colors used to build the procedural 3D model */
  model: { body: number; head: number; visor: number; armor: number };
  /** Visual archetype — drives the procedural 3D model shape */
  silhouette: AgentSilhouette;
  /** ElevenLabs voice id for this agent */
  voiceId: string;
  /** Pre-written Russian voice lines */
  lines: AgentVoiceLines;
  /** Identity card shown in agent-select & profile screens */
  lore: AgentLore;
};

// Voice IDs taken from ElevenLabs default roster (see elevenlabs-tts knowledge)
const VOICES = {
  Brian: "nPczCjzI2devNBz1zQrb",
  Liam: "TX3LPaxmHKxFdv7VOQHJ",
  Charlie: "IKne3meq5aSn9XLyUdCD",
  Daniel: "onwK4e9ZLuTAKqWW03F9",
  Will: "bIHbv24MWmeRgasZH58o",
  George: "JBFqnCBsd6RMkjVDRZzb",
  Callum: "N2lVS1w4EtoT3dr4eOWO",
  Eric: "cjVigY5qzO86Huf0OWal",
  River: "SAz9YHcvj6GT2YYXdXww",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
};

export const AGENTS: Agent[] = [
  {
    id: "blaze", name: "Blaze", role: "Duelist", tagline: "Сжигай. Прорывайся. Доминируй.",
    abilities: { q: "Огненная стена", e: "Зажигательная граната", ult: "Inferno Strike" },
    hue: "#ff5a2e", gradient: "from-orange-500/40 via-red-600/20 to-transparent",
    model: { body: 0x3a1a0e, head: 0xd9a87a, visor: 0xff5a2e, armor: 0x6b2410 },
    silhouette: "soldier",
    voiceId: VOICES.Brian,
    lines: {
      select: "Блейз на связи. Жгём.",
      respawn: "Я не сгорел. Я разогрелся.",
      kill: "Минус один. Подкидывай дров.",
      victory: "Победа. Огонь не остановить.",
      defeat: "Чёрт. Перегруппировка.",
    },
    lore: {
      realName: "Маркус «Блейз» Кейн",
      origin: "Детройт, США",
      bio: "Бывший пожарный, оставивший службу после взрыва нефтеперерабатывающего завода. Теперь использует контролируемое пламя как оружие — то, что когда-то его обожгло, стало его языком.",
      personality: "Агрессивный, прямой, не любит ждать.",
    },
  },
  {
    id: "volt", name: "Volt", role: "Duelist", tagline: "Молния не стучит — она бьёт.",
    abilities: { q: "Электрошок", e: "Рывок", ult: "Thunder Storm" },
    hue: "#7df9ff", gradient: "from-cyan-400/40 via-blue-500/20 to-transparent",
    model: { body: 0x0a3a4a, head: 0xbcd6e0, visor: 0x7df9ff, armor: 0x103848 },
    silhouette: "speedster",
    voiceId: VOICES.Liam,
    lines: {
      select: "Вольт в игре. Скорость решает.",
      respawn: "Перезарядился. Поехали.",
      kill: "Молния не промахивается.",
      victory: "Ток прошёл. Победа наша.",
      defeat: "Сгорел предохранитель. Реванш.",
    },
    lore: {
      realName: "Кай «Вольт» Накамура",
      origin: "Осака, Япония",
      bio: "Гонщик-вундеркинд, сменивший трассу на поле боя после того, как технология ускорителей нашла военное применение. Двигается быстрее, чем большинство успевает прицелиться.",
      personality: "Дерзкий, нетерпеливый, азартный.",
    },
  },
  {
    id: "frost", name: "Frost", role: "Controller", tagline: "Лёд медленнее, чем ты думаешь.",
    abilities: { q: "Ледяная стена", e: "Поле замедления", ult: "Freeze Zone" },
    hue: "#9ad8ff", gradient: "from-sky-300/40 via-cyan-500/20 to-transparent",
    model: { body: 0x1a3a55, head: 0xe6f0fa, visor: 0x9ad8ff, armor: 0x223a55 },
    silhouette: "mage",
    voiceId: VOICES.Charlie,
    lines: {
      select: "Фрост. Замораживаю карту.",
      respawn: "Холодная голова. В бой.",
      kill: "Тепло — больше нет.",
      victory: "Лёд победил. Идеально.",
      defeat: "Растаял. Не в этот раз.",
    },
    lore: {
      realName: "Анна «Фрост» Соколова",
      origin: "Якутск, Россия",
      bio: "Климатолог, выжившая в полярной экспедиции, где её отряд погиб. Вернулась с прототипом криогенератора и пониманием, что холод — это терпение, а не жестокость.",
      personality: "Спокойная, расчётливая, говорит тихо.",
    },
  },
  {
    id: "shadow", name: "Shadow", role: "Controller", tagline: "Тебя нет. Был — есть нет.",
    abilities: { q: "Телепорт", e: "Дымовая сфера", ult: "Vanish" },
    hue: "#8a6bff", gradient: "from-violet-500/40 via-purple-700/20 to-transparent",
    model: { body: 0x1a0e2c, head: 0x9c8aae, visor: 0x8a6bff, armor: 0x2a1a44 },
    silhouette: "stealth",
    voiceId: VOICES.Daniel,
    lines: {
      select: "Шэдоу. Никто не увидит.",
      respawn: "Снова в тенях.",
      kill: "Тихо. Чисто. Дальше.",
      victory: "Победа из тени.",
      defeat: "Тень тоже умирает. Иногда.",
    },
    lore: {
      realName: "Имя засекречено",
      origin: "Прага, Чехия",
      bio: "Бывший оперативник разведки, официально мёртв уже семь лет. От него остались только зашифрованные отчёты и слухи. Использует экспериментальные фазовые модули, чтобы исчезать буквально.",
      personality: "Сдержанный, циничный, минималист в словах.",
    },
  },
  {
    id: "pulse", name: "Pulse", role: "Initiator", tagline: "Сначала вижу — потом стреляю.",
    abilities: { q: "Сканер врагов", e: "Соник граната", ult: "Recon Wave" },
    hue: "#5cffb0", gradient: "from-emerald-400/40 via-green-500/20 to-transparent",
    model: { body: 0x0e2a1d, head: 0xc8e6cf, visor: 0x5cffb0, armor: 0x144028 },
    silhouette: "scout",
    voiceId: VOICES.Will,
    lines: {
      select: "Пульс на сканере. Я веду.",
      respawn: "Сигнал восстановлен.",
      kill: "Цель устранена. Сканирую дальше.",
      victory: "Чистая разведка — чистая победа.",
      defeat: "Помехи. Будем умнее.",
    },
    lore: {
      realName: "Эзра «Пульс» Окафор",
      origin: "Лагос, Нигерия",
      bio: "Инженер-радиоэлектронщик, превративший прослушку в искусство. Слышит электромагнитное поле так же, как другие слышат шаги — и редко ошибается, где затаился враг.",
      personality: "Аналитичный, общительный, любит командовать.",
    },
  },
  {
    id: "nova", name: "Nova", role: "Initiator", tagline: "Свет — это оружие.",
    abilities: { q: "Флэш граната", e: "Энергетический луч", ult: "Orbital Laser" },
    hue: "#ffd84a", gradient: "from-yellow-400/40 via-amber-500/20 to-transparent",
    model: { body: 0x3a2e08, head: 0xe6d4a8, visor: 0xffd84a, armor: 0x4a3a10 },
    silhouette: "sniper",
    voiceId: VOICES.George,
    lines: {
      select: "Нова. Ослеплю и сожгу.",
      respawn: "Снова сияю.",
      kill: "Слишком ярко для тебя?",
      victory: "Свет всегда побеждает тьму.",
      defeat: "Затмение. Но не конец.",
    },
    lore: {
      realName: "Изабель «Нова» Дюран",
      origin: "Марсель, Франция",
      bio: "Астрофизик, работавшая с орбитальным лазером гражданского назначения. Когда проект засекретили, она забрала ключи доступа и теперь сама выбирает, куда направить луч.",
      personality: "Холодная, ироничная, не терпит дилетантов.",
    },
  },
  {
    id: "titan", name: "Titan", role: "Sentinel", tagline: "Стой за мной. Я стена.",
    abilities: { q: "Щитовая стена", e: "Бафф брони", ult: "Invincible" },
    hue: "#ff8a3d", gradient: "from-orange-400/40 via-yellow-700/20 to-transparent",
    model: { body: 0x2a1a0a, head: 0xc8a888, visor: 0xff8a3d, armor: 0x553a1a },
    silhouette: "heavy",
    voiceId: VOICES.Callum,
    lines: {
      select: "Титан занял позицию. Держусь.",
      respawn: "Снова в строю. Несокрушим.",
      kill: "Стена раздавила. Следующий.",
      victory: "Никто не прошёл. Победа.",
      defeat: "Стена дала трещину. Восстановимся.",
    },
    lore: {
      realName: "Стиг «Титан» Олафсон",
      origin: "Берген, Норвегия",
      bio: "Бывший оператор противоракетного комплекса, переживший прямое попадание в бункер. С тех пор носит экзоброню собственной сборки — официально, чтобы прикрывать команду; неофициально — потому что больше не доверяет стенам, которые не построил сам.",
      personality: "Тяжеловесный, надёжный, говорит редко.",
    },
  },
  {
    id: "ghost", name: "Ghost", role: "Sentinel", tagline: "Тихо. Слишком тихо.",
    abilities: { q: "Тихие шаги", e: "Клон-приманка", ult: "Shadow Army" },
    hue: "#b8b8c8", gradient: "from-slate-400/40 via-zinc-600/20 to-transparent",
    model: { body: 0x1a1a22, head: 0xa8a8b4, visor: 0xb8b8c8, armor: 0x2a2a36 },
    silhouette: "ninja",
    voiceId: VOICES.Eric,
    lines: {
      select: "Гост. Меня здесь не было.",
      respawn: "Призраки не умирают.",
      kill: "Тебя убил кто-то. Никто.",
      victory: "Победа без свидетелей.",
      defeat: "Видимость снижается. Уходим.",
    },
    lore: {
      realName: "Рен «Гост» Морита",
      origin: "Киото, Япония",
      bio: "Наследница школы боевых искусств, отказавшаяся от наследства ради контракта с тайным подразделением. Двигается так, будто пол не существует, и оставляет после себя только сомнения свидетелей.",
      personality: "Молчаливая, сосредоточенная, фаталист.",
    },
  },
  {
    id: "echo", name: "Echo", role: "Sentinel", tagline: "Лечу, ускоряю, поднимаю.",
    abilities: { q: "Поле лечения", e: "Ускорение", ult: "Revive" },
    hue: "#7df0a5", gradient: "from-emerald-300/40 via-teal-500/20 to-transparent",
    model: { body: 0x103a26, head: 0xd0eed8, visor: 0x7df0a5, armor: 0x1a4a32 },
    silhouette: "support",
    voiceId: VOICES.River,
    lines: {
      select: "Эко. Держу команду на ногах.",
      respawn: "Снова в эфире. Лечу.",
      kill: "Один меньше. Команда сильнее.",
      victory: "Все живы. Все в плюсе.",
      defeat: "Не успела. В следующий раз — успею.",
    },
    lore: {
      realName: "Майя «Эко» Рейес",
      origin: "Манила, Филиппины",
      bio: "Военный медик с тремя боевыми турами. После последнего разработала наноинъекторы, способные поднимать на ноги даже того, чьё сердце уже остановилось. Никого не оставляет на поле боя.",
      personality: "Тёплая, упрямая, защитница до конца.",
    },
  },
  {
    id: "phoenix", name: "Phoenix", role: "Duelist", tagline: "Смерть — это пауза.",
    abilities: { q: "Огненный шар", e: "Рывок сквозь пламя", ult: "Rebirth" },
    hue: "#ff4d6d", gradient: "from-rose-500/40 via-pink-600/20 to-transparent",
    model: { body: 0x3a0e1a, head: 0xe6a4ae, visor: 0xff4d6d, armor: 0x550e20 },
    silhouette: "ninja",
    voiceId: VOICES.Sarah,
    lines: {
      select: "Феникс. Я возвращаюсь всегда.",
      respawn: "Из пепла — снова в бой.",
      kill: "Сгорел. Как и всё, что я касаюсь.",
      victory: "Возрождение завершено.",
      defeat: "Не последний раз. Никогда.",
    },
    lore: {
      realName: "Лейла «Феникс» Хабиб",
      origin: "Касабланка, Марокко",
      bio: "Объявлена погибшей трижды — и трижды возвращалась с поля боя без объяснений. Носит на спине шрам в форме крыла; утверждает, что ничего об этом не помнит.",
      personality: "Дерзкая, неугомонная, насмешливая.",
    },
  },
];
