import * as THREE from "three";
import type { Bot, GameConfig, RunState, SmokeOrb, Tracer, AbilityKey } from "./types";
import { makeRun } from "./types";
import type { Settings } from "./settings";
import { Multiplayer } from "./multiplayer";
import { buildAgentModel } from "./agent-model";
import { AGENTS } from "./data/agents";
import { MAPS, type MapLayout } from "./data/maps";

// Map physical key codes -> logical action so the game works regardless of
// keyboard layout (русская/английская и т.п.)
const CODE_MAP: Record<string, string> = {
  KeyW: "w",
  KeyA: "a",
  KeyS: "s",
  KeyD: "d",
  KeyR: "r",
  KeyF: "f",
  KeyC: "c",
  KeyQ: "q",
  KeyE: "e",
  KeyX: "x",
  Escape: "escape",
};

export type EngineCallbacks = {
  onState: (s: RunState) => void;
  onEnd: (result: { won: boolean; kills: number }) => void;
  onKill?: () => void;
  onRespawn?: () => void;
};

export class FPSEngine {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();

  private keys = new Set<string>();
  private mouseDown = false;
  private yaw = 0;
  private pitch = 0;

  private playerPos = new THREE.Vector3(0, 1.7, 0);
  private playerVel = new THREE.Vector3();
  private playerRadius = 0.5;
  private playerHeight = 1.7;

  private walls: THREE.Box3[] = [];
  private wallMeshes: THREE.Mesh[] = [];
  private bots: Bot[] = [];
  private tracers: Tracer[] = [];
  private smokes: SmokeOrb[] = [];
  private plantedPack: THREE.Group | null = null;
  private plantedPackLight: THREE.PointLight | null = null;
  private flashMeshes: { mesh: THREE.Mesh; life: number }[] = [];
  private smokePlanner: {
    key: AbilityKey;
    overlay: HTMLDivElement;
    map: HTMLDivElement;
    marker: HTMLDivElement;
    selected: THREE.Vector3;
  } | null = null;

  private mp: Multiplayer | null = null;
  private remoteMeshes = new Map<string, THREE.Group>();

  private run: RunState;
  private cfg: GameConfig;
  private cb: EngineCallbacks;
  private raf = 0;
  private container: HTMLElement;
  private disposed = false;
  private pointerLocked = false;

  private settings: Settings;
  private paused = false;

  // ---- Theme / day-night state ----
  private hemi!: THREE.HemisphereLight;
  private dirLight!: THREE.DirectionalLight;
  private ambientAccent: THREE.PointLight[] = [];
  private cycleTime = 0; // seconds since match start, only used if dynamicCycle
  private dynamicCycle = false;

  private onKeyDown = (e: KeyboardEvent) => {
    const k = CODE_MAP[e.code];
    if (!k) return;
    if (k === "escape" && this.smokePlanner) {
      this.closeSmokePlanner(false);
      return;
    }
    if (this.smokePlanner) return;
    this.keys.add(k);
    if (k === "r") this.reload();
    if (k === "c" || k === "q" || k === "e" || k === "x") this.useAbility(k as AbilityKey);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = CODE_MAP[e.code];
    if (k) this.keys.delete(k);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (this.smokePlanner) return;
    if (!this.pointerLocked) {
      this.renderer.domElement.requestPointerLock();
      return;
    }
    if (e.button === 0) this.mouseDown = true;
  };
  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.mouseDown = false;
  };
  private onMouseMove = (e: MouseEvent) => {
    if (this.smokePlanner) return;
    if (!this.pointerLocked) return;
    const sens = 0.0025 * this.settings.sensitivity;
    this.yaw -= e.movementX * sens;
    this.pitch -= e.movementY * sens;
    this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
  };
  private onPointerLockChange = () => {
    this.pointerLocked = document.pointerLockElement === this.renderer.domElement;
  };
  private onResize = () => {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  constructor(container: HTMLElement, cfg: GameConfig, settings: Settings, cb: EngineCallbacks) {
    this.container = container;
    this.cfg = cfg;
    this.settings = settings;
    this.cb = cb;
    this.run = makeRun(cfg);
    const spawn = this.getMapLayout().attackerSpawn;
    this.playerPos.set(spawn.x, this.playerHeight, spawn.z);
    this.yaw = Math.PI;
    if (getComputedStyle(container).position === "static") container.style.position = "relative";

    const pixelRatio =
      settings.graphics === "low"
        ? 0.7
        : settings.graphics === "medium"
          ? Math.min(window.devicePixelRatio, 1.25)
          : Math.min(window.devicePixelRatio, 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.graphics !== "low" });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = settings.graphics === "high" ? 1.08 : 1;
    this.renderer.shadowMap.enabled = settings.graphics !== "low";
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.cursor = "crosshair";

    this.camera = new THREE.PerspectiveCamera(
      settings.fov,
      container.clientWidth / container.clientHeight,
      0.1,
      500,
    );
    const pal = this.getPalette();
    this.dynamicCycle = !!cfg.dynamicCycle;
    this.scene.background = new THREE.Color(pal.sky);
    const fogNear = settings.graphics === "low" ? 20 : settings.graphics === "medium" ? 30 : 50;
    const fogFar = settings.graphics === "low" ? 60 : settings.graphics === "medium" ? 90 : 140;
    this.scene.fog = new THREE.Fog(pal.fog, fogNear, fogFar);
    this.addSkyDome(pal.sky, pal.fog);

    this.buildLevel();
    this.spawnBots(cfg.botCount);

    if (cfg.multiplayer) {
      this.mp = new Multiplayer(cfg.room || "public-1", cfg.playerName || "Operator");
      this.mp.start();
    }

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    window.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    window.addEventListener("resize", this.onResize);

    this.loop();
  }

  /** Manually request pointer lock (used by an overlay click). */
  requestPointerLock() {
    this.renderer.domElement.requestPointerLock();
  }

  updateSettings(s: Settings) {
    this.settings = s;
    this.camera.fov = s.fov;
    this.camera.updateProjectionMatrix();
  }

  private getMapLayout(): MapLayout {
    return MAPS.find((m) => m.id === this.cfg.mapId)?.layout ?? MAPS[0].layout;
  }

  /** Compute palette from map theme + time of day. */
  private getPalette() {
    const theme = this.cfg.mapTheme || "urban";
    const tod = this.cfg.timeOfDay || "day";

    // Per-theme base material colors (natural materials, low saturation)
    const themeCols: Record<
      string,
      { ground: number; wall: number; accent: number; crate: number; rough: number; metal: number }
    > = {
      desert: {
        ground: 0xc69b6a,
        wall: 0xa8896a,
        accent: 0x6b4a2a,
        crate: 0x8b5a2b,
        rough: 0.95,
        metal: 0.0,
      },
      arctic: {
        ground: 0xdde9f1,
        wall: 0xa6b7c4,
        accent: 0x6a8aa3,
        crate: 0x5a6a78,
        rough: 0.7,
        metal: 0.25,
      },
      temple: {
        ground: 0x4f6b3a,
        wall: 0x7a7466,
        accent: 0x3d5a2a,
        crate: 0x6b4a2a,
        rough: 0.9,
        metal: 0.05,
      },
      urban: {
        ground: 0x6a6e72,
        wall: 0x8a8e93,
        accent: 0x3a3d42,
        crate: 0x6b4a2a,
        rough: 0.85,
        metal: 0.15,
      },
      neon: {
        ground: 0x1e2236,
        wall: 0x3a4358,
        accent: 0x22ddee,
        crate: 0x444c66,
        rough: 0.6,
        metal: 0.25,
      },
    };

    // Per-time-of-day sky/fog/light tint
    const todCols: Record<
      string,
      {
        sky: number;
        fog: number;
        hemiSky: number;
        hemiGround: number;
        sunCol: number;
        sunInt: number;
        hemiInt: number;
      }
    > = {
      day: {
        sky: 0xa9c8e0,
        fog: 0xbcd0e0,
        hemiSky: 0xbfd8f0,
        hemiGround: 0x6b6253,
        sunCol: 0xfff1d6,
        sunInt: 1.1,
        hemiInt: 0.85,
      },
      evening: {
        sky: 0x6e4a55,
        fog: 0x4a3a3e,
        hemiSky: 0xd49070,
        hemiGround: 0x2a2030,
        sunCol: 0xff9a5a,
        sunInt: 0.8,
        hemiInt: 0.55,
      },
      night: {
        sky: 0x0a0e1a,
        fog: 0x0a0e1a,
        hemiSky: 0x4a5a78,
        hemiGround: 0x0a0a14,
        sunCol: 0x7088b0,
        sunInt: 0.35,
        hemiInt: 0.4,
      },
    };

    const t = themeCols[theme];
    const s = todCols[tod];
    return { ...t, ...s };
  }

  private makeCanvasTexture(
    theme: string,
    base: number,
    scale = 8,
  ): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
    const size = 256;
    const color = new THREE.Color(base);
    const canvas = document.createElement("canvas");
    const bump = document.createElement("canvas");
    canvas.width = bump.width = size;
    canvas.height = bump.height = size;
    const ctx = canvas.getContext("2d");
    const btx = bump.getContext("2d");
    if (!ctx || !btx) throw new Error("Canvas texture context unavailable");

    ctx.fillStyle = `#${color.getHexString()}`;
    ctx.fillRect(0, 0, size, size);
    btx.fillStyle = "#808080";
    btx.fillRect(0, 0, size, size);

    const flecks = theme === "snow" ? 420 : theme === "sand" ? 720 : theme === "wood" ? 260 : 520;
    for (let i = 0; i < flecks; i++) {
      const x = Math.random() * size;
      const y = Math.random() * size;
      const r = Math.random() * (theme === "concrete" || theme === "stone" ? 2.4 : 1.4) + 0.35;
      const light = (Math.random() - 0.5) * (theme === "metal" ? 0.16 : 0.26);
      const c = color.clone().offsetHSL(0, 0, light);
      ctx.fillStyle = `rgba(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)}, ${theme === "snow" ? 0.4 : 0.55})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();

      const v = Math.max(50, Math.min(210, 128 + light * 280));
      btx.fillStyle = `rgb(${v},${v},${v})`;
      btx.beginPath();
      btx.arc(x, y, r, 0, Math.PI * 2);
      btx.fill();
    }

    if (theme === "concrete" || theme === "stone" || theme === "metal") {
      const grid = theme === "stone" ? 64 : 42;
      ctx.strokeStyle = theme === "metal" ? "rgba(255,255,255,0.12)" : "rgba(20,18,16,0.18)";
      ctx.lineWidth = theme === "metal" ? 2 : 1;
      for (let p = 0; p <= size; p += grid) {
        ctx.beginPath();
        ctx.moveTo(p + (Math.random() - 0.5) * 3, 0);
        ctx.lineTo(p + (Math.random() - 0.5) * 3, size);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, p + (Math.random() - 0.5) * 3);
        ctx.lineTo(size, p + (Math.random() - 0.5) * 3);
        ctx.stroke();
      }
    }

    if (theme === "wood") {
      for (let y = 12; y < size; y += 22 + Math.random() * 10) {
        ctx.strokeStyle = "rgba(40,20,8,0.32)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.bezierCurveTo(70, y + 8, 145, y - 8, size, y + 4);
        ctx.stroke();
      }
    }

    if (theme === "sand" || theme === "snow") {
      for (let y = 0; y < size; y += 18) {
        ctx.strokeStyle = theme === "snow" ? "rgba(110,150,180,0.12)" : "rgba(120,75,35,0.16)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= size; x += 24) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 4);
        ctx.stroke();
      }
    }

    if (theme === "wet") {
      const sheen = ctx.createLinearGradient(0, 0, size, size);
      sheen.addColorStop(0, "rgba(255,255,255,0.18)");
      sheen.addColorStop(0.18, "rgba(255,255,255,0)");
      sheen.addColorStop(0.55, "rgba(255,255,255,0.12)");
      sheen.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = sheen;
      ctx.fillRect(0, 0, size, size);
    }

    const map = new THREE.CanvasTexture(canvas);
    const bumpMap = new THREE.CanvasTexture(bump);
    for (const tex of [map, bumpMap]) {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(scale, scale);
      tex.anisotropy = this.settings.graphics === "high" ? 8 : 2;
    }
    return { map, bumpMap };
  }

  private makeThemeMaterial(
    theme: string,
    base: number,
    kind: "ground" | "wall" | "crate" | "roof",
    roughness: number,
    metalness: number,
  ) {
    const textureTheme =
      kind === "crate"
        ? "wood"
        : theme === "desert"
          ? kind === "ground"
            ? "sand"
            : "stone"
          : theme === "arctic"
            ? kind === "ground"
              ? "snow"
              : "metal"
            : theme === "temple"
              ? "stone"
              : theme === "neon"
                ? kind === "ground"
                  ? "wet"
                  : "metal"
                : kind === "ground"
                  ? "concrete"
                  : "metal";
    const scale = kind === "ground" ? 18 : kind === "crate" ? 2.4 : 5;
    const tex = this.makeCanvasTexture(textureTheme, base, scale);
    return new THREE.MeshStandardMaterial({
      color: base,
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale:
        this.settings.graphics === "low"
          ? 0.025
          : textureTheme === "sand" || textureTheme === "stone"
            ? 0.09
            : 0.055,
      roughness,
      metalness,
      envMapIntensity: theme === "neon" || theme === "urban" ? 1.1 : 0.65,
    });
  }

  private addWallDetails(mesh: THREE.Mesh, isCrate: boolean, index: number) {
    const [w, h, d] = (mesh.geometry as THREE.BoxGeometry).parameters
      ? [
          (mesh.geometry as THREE.BoxGeometry).parameters.width,
          (mesh.geometry as THREE.BoxGeometry).parameters.height,
          (mesh.geometry as THREE.BoxGeometry).parameters.depth,
        ]
      : [1, 1, 1];
    const theme = this.cfg.mapTheme || "urban";
    const detailColor = isCrate
      ? 0x1d140c
      : theme === "desert"
        ? 0x5f472e
        : theme === "arctic"
          ? 0xd7edf8
          : theme === "temple"
            ? 0x2f3f25
            : 0x11151a;
    const lineMat = new THREE.MeshStandardMaterial({
      color: detailColor,
      roughness: 0.85,
      metalness: theme === "urban" || theme === "neon" ? 0.35 : 0.04,
    });

    if (isCrate) {
      const strapMat = new THREE.MeshStandardMaterial({
        color: 0x17110c,
        roughness: 0.6,
        metalness: 0.35,
      });
      for (const z of [d / 2 + 0.011, -d / 2 - 0.011]) {
        const band = new THREE.Mesh(new THREE.BoxGeometry(w * 0.94, h * 0.12, 0.028), strapMat);
        band.position.set(0, h * 0.15, z);
        mesh.add(band);
        const sideBand = new THREE.Mesh(new THREE.BoxGeometry(w * 0.16, h * 0.82, 0.03), strapMat);
        sideBand.position.set((index % 2 ? -0.24 : 0.24) * w, 0, z);
        mesh.add(sideBand);
      }
      return;
    }

    const horizontalFaces = w >= d;
    const long = horizontalFaces ? w : d;
    const thickness = 0.045;
    for (let i = 1; i < Math.min(5, Math.floor(long / 2)); i++) {
      const offset = -long / 2 + (long * i) / Math.min(5, Math.floor(long / 2) + 1);
      const seam = new THREE.Mesh(
        horizontalFaces
          ? new THREE.BoxGeometry(thickness, h * 0.92, 0.034)
          : new THREE.BoxGeometry(0.034, h * 0.92, thickness),
        lineMat,
      );
      seam.position.set(horizontalFaces ? offset : 0, 0, horizontalFaces ? d / 2 + 0.012 : offset);
      mesh.add(seam);
    }

    if (theme === "neon" && index % 3 === 0) {
      const glowMat = new THREE.MeshBasicMaterial({
        color: index % 2 ? 0xff3ea5 : 0x22ddee,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
      });
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(
          horizontalFaces ? Math.min(2.8, w * 0.45) : 0.05,
          0.12,
          horizontalFaces ? 0.05 : Math.min(2.8, d * 0.45),
        ),
        glowMat,
      );
      sign.position.set(0, h * 0.2, horizontalFaces ? d / 2 + 0.025 : 0);
      mesh.add(sign);
    }
  }

  private buildLevel() {
    const pal = this.getPalette();

    // ===== Lights =====
    this.hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemiInt);
    this.scene.add(this.hemi);
    this.dirLight = new THREE.DirectionalLight(pal.sunCol, pal.sunInt);
    this.dirLight.position.set(30, 60, 20);
    this.dirLight.castShadow = this.settings.graphics !== "low";
    this.dirLight.shadow.mapSize.set(
      this.settings.graphics === "high" ? 2048 : 1024,
      this.settings.graphics === "high" ? 2048 : 1024,
    );
    this.dirLight.shadow.camera.near = 1;
    this.dirLight.shadow.camera.far = 140;
    this.dirLight.shadow.camera.left = -55;
    this.dirLight.shadow.camera.right = 55;
    this.dirLight.shadow.camera.top = 55;
    this.dirLight.shadow.camera.bottom = -55;
    this.dirLight.shadow.bias = -0.00018;
    this.scene.add(this.dirLight);

    // Theme accent fills (warm lanterns in temple, cold pools in arctic, neon in neon city...)
    const theme = this.cfg.mapTheme || "urban";
    const accentSpots: Array<[number, number, number]> = [
      [-12, 3, 0],
      [12, 3, 0],
      [0, 3, -12],
      [0, 3, 12],
    ];
    const accentCol =
      theme === "neon"
        ? 0x22ddee
        : theme === "desert"
          ? 0xffb070
          : theme === "arctic"
            ? 0x88c4ff
            : theme === "temple"
              ? 0xffae55
              : 0xffc080;
    const accentInt = theme === "neon" ? 1.2 : 0.55;
    for (const [x, y, z] of accentSpots) {
      const p = new THREE.PointLight(accentCol, accentInt, 30);
      p.position.set(x, y, z);
      p.castShadow = this.settings.graphics === "high";
      this.scene.add(p);
      this.ambientAccent.push(p);
      this.addLightHalo(x, y, z, accentCol, theme === "neon" ? 1.6 : 1.1);
    }

    // ===== Ground =====
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120, 24, 24),
      this.makeThemeMaterial(theme, pal.ground, "ground", pal.rough, pal.metal * 0.3),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Subtle grid only for neon theme; natural maps get scattered detail props instead
    if (theme === "neon") {
      const grid = new THREE.GridHelper(120, 60, 0x2a3450, 0x1a2030);
      (grid.material as THREE.Material).transparent = true;
      (grid.material as THREE.Material).opacity = 0.35;
      this.scene.add(grid);
    }

    // ====== WALLS (interior layout — same gameplay shape across all themes) ======
    const wallDefs: number[][] = [
      // outer perimeter (open arena 80x80)
      [0, -40, 80, 1, 5],
      [0, 40, 80, 1, 5],
      [-40, 0, 1, 80, 5],
      [40, 0, 1, 80, 5],
      // central building 30x30 with door gaps
      [-10.5, -15, 9, 1, 4],
      [10.5, -15, 9, 1, 4],
      [-10.5, 15, 9, 1, 4],
      [10.5, 15, 9, 1, 4],
      [-15, -10.5, 1, 9, 4],
      [-15, 10.5, 1, 9, 4],
      [15, -10.5, 1, 9, 4],
      [15, 10.5, 1, 9, 4],
      // internal cross divider
      [-9, 0, 12, 1, 3.5],
      [9, 0, 12, 1, 3.5],
      [0, -9, 1, 12, 3.5],
      [0, 9, 1, 12, 3.5],
      // pillars at building corners
      [-14, -14, 1.5, 1.5, 4.5],
      [14, -14, 1.5, 1.5, 4.5],
      [-14, 14, 1.5, 1.5, 4.5],
      [14, 14, 1.5, 1.5, 4.5],
      // crates inside rooms (low cover)
      [-9, -9, 1.6, 1.6, 1.4],
      [-5, -11, 1.6, 1.6, 1.4],
      [9, -9, 1.6, 1.6, 1.4],
      [11, -5, 1.6, 1.6, 1.4],
      [-9, 9, 1.6, 1.6, 1.4],
      [9, 9, 1.6, 1.6, 1.4],
      [-11, 5, 1.6, 1.6, 1.4],
      [5, 11, 1.6, 1.6, 1.4],
      // outdoor cover
      [-25, -10, 2, 6, 2.2],
      [25, 10, 2, 6, 2.2],
      [-10, -25, 6, 2, 2.2],
      [10, 25, 6, 2, 2.2],
      [-30, 0, 1.5, 8, 3],
      [30, 0, 1.5, 8, 3],
      [0, -30, 8, 1.5, 3],
      [0, 30, 8, 1.5, 3],
      // outer corner pillars
      [-32, -32, 2, 2, 5],
      [32, -32, 2, 2, 5],
      [-32, 32, 2, 2, 5],
      [32, 32, 2, 2, 5],
      // long sight-blocker walls between spawns
      [-22, -22, 8, 1, 3],
      [22, 22, 8, 1, 3],
      [-22, 22, 1, 8, 3],
      [22, -22, 1, 8, 3],
    ];

    const wallMat = this.makeThemeMaterial(
      theme,
      pal.wall,
      "wall",
      Math.max(0.42, pal.rough - 0.12),
      pal.metal,
    );
    const crateMat = this.makeThemeMaterial(theme, pal.crate, "crate", 0.72, 0.08);
    for (let i = 0; i < wallDefs.length; i++) {
      const [x, z, w, d, h] = wallDefs[i];
      // crates (low boxes ≤ 1.6 tall) get the wood/crate material
      const isCrate = h <= 1.6;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), isCrate ? crateMat : wallMat);
      mesh.position.set(x, h / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.addWallDetails(mesh, isCrate, i);
      this.wallMeshes.push(mesh);
      this.walls.push(new THREE.Box3().setFromObject(mesh));
    }

    this.addObjectiveMarkers();

    // ===== Theme decoration (no collision) =====
    if (theme === "desert") {
      // scattered rocks
      const rockMat = this.makeThemeMaterial(theme, 0x7a6a55, "wall", 1, 0.02);
      const rockSpots: Array<[number, number, number]> = [
        [-28, 0, 8],
        [26, 0, -6],
        [-18, 0, 28],
        [20, 0, 22],
        [-34, 0, -20],
        [34, 0, 18],
      ];
      for (const [x, y, z] of rockSpots) {
        const r = new THREE.Mesh(
          new THREE.DodecahedronGeometry(0.8 + Math.random() * 0.6),
          rockMat,
        );
        r.position.set(x, y + 0.4, z);
        r.rotation.set(Math.random(), Math.random(), Math.random());
        this.scene.add(r);
      }
      const tarpMat = new THREE.MeshStandardMaterial({
        color: 0x33404a,
        roughness: 0.88,
        metalness: 0.02,
      });
      for (const [x, z, rot] of [
        [-20, -15, 0.35],
        [24, 17, -0.25],
      ] as Array<[number, number, number]>) {
        const tarp = new THREE.Mesh(new THREE.BoxGeometry(5.5, 0.08, 3), tarpMat);
        tarp.position.set(x, 2.35, z);
        tarp.rotation.y = rot;
        tarp.castShadow = true;
        this.scene.add(tarp);
      }
    } else if (theme === "temple") {
      // grass tufts + stone blocks
      const grassMat = new THREE.MeshStandardMaterial({ color: 0x3d6b25, roughness: 1 });
      for (let i = 0; i < 40; i++) {
        const t = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.4, 5), grassMat);
        const ang = Math.random() * Math.PI * 2;
        const rad = 18 + Math.random() * 18;
        t.position.set(Math.cos(ang) * rad, 0.2, Math.sin(ang) * rad);
        this.scene.add(t);
      }
      const vineMat = new THREE.MeshStandardMaterial({ color: 0x28461f, roughness: 1 });
      for (const [x, z, rot] of [
        [-15.55, 0, Math.PI / 2],
        [15.55, 0, -Math.PI / 2],
        [0, 15.55, 0],
        [0, -15.55, Math.PI],
      ] as Array<[number, number, number]>) {
        const vine = new THREE.Mesh(new THREE.BoxGeometry(0.12, 2.2, 2.8), vineMat);
        vine.position.set(x, 2.15, z);
        vine.rotation.y = rot;
        this.scene.add(vine);
      }
    } else if (theme === "arctic") {
      // snow mounds
      const snowMat = this.makeThemeMaterial(theme, 0xeef4fa, "ground", 0.9, 0.02);
      const spots: Array<[number, number]> = [
        [-26, 18],
        [22, -22],
        [-20, -28],
        [28, 26],
        [-34, 4],
      ];
      for (const [x, z] of spots) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), snowMat);
        s.position.set(x, 0.2, z);
        s.scale.y = 0.35;
        this.scene.add(s);
      }
      const frostGlass = new THREE.MeshPhysicalMaterial({
        color: 0xc8edff,
        roughness: 0.18,
        metalness: 0.02,
        transparent: true,
        opacity: 0.34,
        transmission: 0.35,
      });
      for (const [x, z, rot] of [
        [-14.8, 0, Math.PI / 2],
        [14.8, 0, -Math.PI / 2],
        [0, -14.8, Math.PI],
        [0, 14.8, 0],
      ] as Array<[number, number, number]>) {
        const glass = new THREE.Mesh(new THREE.BoxGeometry(4.5, 2.2, 0.08), frostGlass);
        glass.position.set(x, 2.15, z);
        glass.rotation.y = rot;
        this.scene.add(glass);
      }
    } else if (theme === "neon") {
      // keep tasteful neon strips (dialed down from before)
      const neonCyanMat = new THREE.MeshBasicMaterial({
        color: 0x22ddee,
        transparent: true,
        opacity: 0.9,
      });
      const stripDefs = [
        [0, 0.02, -15, 5.5, 0.15],
        [0, 0.02, 15, 5.5, 0.15],
        [-15, 0.02, 0, 0.15, 5.5],
        [15, 0.02, 0, 0.15, 5.5],
      ];
      for (const [x, y, z, w, d] of stripDefs) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), neonCyanMat);
        m.position.set(x, y, z);
        this.scene.add(m);
      }
      this.addNeonBillboards();
    } else if (theme === "urban") {
      this.addUrbanLightPanels();
      this.addIndustrialProps();
    }

    // ===== Ceiling tiles over the central building =====
    const ceilMat = this.makeThemeMaterial(theme, pal.accent, "roof", 0.9, pal.metal);
    const ceilingTiles = [
      [-7.5, 4.2, -7.5, 13, 13],
      [7.5, 4.2, -7.5, 13, 13],
      [-7.5, 4.2, 7.5, 13, 13],
      [7.5, 4.2, 7.5, 13, 13],
    ];
    for (const [cx, cy, cz, cw, cd] of ceilingTiles) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.2, cd), ceilMat);
      c.position.set(cx, cy, cz);
      c.castShadow = true;
      c.receiveShadow = true;
      this.scene.add(c);
    }
  }

  private addSkyDome(sky: number, fog: number) {
    const top = new THREE.Color(sky).offsetHSL(0, 0.08, 0.08);
    const horizon = new THREE.Color(fog).offsetHSL(0, 0.03, -0.02);
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    grad.addColorStop(0, `#${top.getHexString()}`);
    grad.addColorStop(0.58, `#${new THREE.Color(sky).getHexString()}`);
    grad.addColorStop(1, `#${horizon.getHexString()}`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(260, 32, 16),
      new THREE.MeshBasicMaterial({
        map: texture,
        side: THREE.BackSide,
        depthWrite: false,
      }),
    );
    dome.renderOrder = -1000;
    this.scene.add(dome);
  }

  private addLightHalo(x: number, y: number, z: number, color: number, scale: number) {
    if (this.settings.graphics === "low") return;
    const halo = new THREE.Mesh(
      new THREE.SphereGeometry(1.2 * scale, 16, 8),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    halo.position.set(x, y, z);
    this.scene.add(halo);
  }

  /** Drive the day → evening → night cycle (only when dynamicCycle is on). */
  private addNeonBillboards() {
    const colors = [0x22ddee, 0xff3ea5, 0xffd166, 0x7df9ff];
    const spots: Array<[number, number, number, number]> = [
      [-34, 3.4, -18, Math.PI / 2],
      [34, 3.4, 18, -Math.PI / 2],
      [-18, 3.4, 34, 0],
      [18, 3.4, -34, Math.PI],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [x, y, z, rot] = spots[i];
      const color = colors[i % colors.length];
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(4.8, 1.2, 0.08),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.72,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      panel.position.set(x, y, z);
      panel.rotation.y = rot;
      this.scene.add(panel);
      const lamp = new THREE.PointLight(color, 0.7, 18);
      lamp.position.set(x, y, z);
      this.scene.add(lamp);
      this.addLightHalo(x, y, z, color, 1.2);
    }
  }

  private addUrbanLightPanels() {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffd7a0,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const panels: Array<[number, number, number, number, number]> = [
      [-13.8, 2.4, -7, Math.PI / 2, 2.8],
      [13.8, 2.4, 7, -Math.PI / 2, 2.8],
      [-7, 2.4, 13.8, 0, 2.8],
      [7, 2.4, -13.8, Math.PI, 2.8],
    ];
    for (const [x, y, z, rot, width] of panels) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.35, 0.06), mat);
      panel.position.set(x, y, z);
      panel.rotation.y = rot;
      this.scene.add(panel);
    }
  }

  private addIndustrialProps() {
    const pipeMat = new THREE.MeshStandardMaterial({
      color: 0x2d343a,
      roughness: 0.46,
      metalness: 0.82,
      envMapIntensity: 1.1,
    });
    const rustMat = new THREE.MeshStandardMaterial({
      color: 0x7a3f24,
      roughness: 0.92,
      metalness: 0.18,
    });
    const pipeDefs: Array<[number, number, number, number, number]> = [
      [-18, 3.2, -20, Math.PI / 2, 8],
      [18, 3.2, 20, Math.PI / 2, 8],
      [-31, 2.7, 8, 0, 7],
      [31, 2.7, -8, 0, 7],
    ];
    for (const [x, y, z, rot, len] of pipeDefs) {
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, len, 16), pipeMat);
      pipe.position.set(x, y, z);
      pipe.rotation.z = Math.PI / 2;
      pipe.rotation.y = rot;
      pipe.castShadow = true;
      this.scene.add(pipe);

      const collar = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.035, 8, 18), rustMat);
      collar.position.set(x, y, z);
      collar.rotation.y = rot;
      this.scene.add(collar);
    }

    const cableMat = new THREE.MeshStandardMaterial({
      color: 0x07090b,
      roughness: 0.65,
      metalness: 0.25,
    });
    for (const [x, z] of [
      [-24, 24],
      [24, -24],
      [0, 34],
    ] as Array<[number, number]>) {
      const cable = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.04, 8, 24), cableMat);
      cable.position.set(x, 0.08, z);
      cable.rotation.x = Math.PI / 2;
      cable.scale.set(1.5, 0.65, 1);
      this.scene.add(cable);
    }
  }

  private updateCycle(dt: number) {
    if (!this.dynamicCycle) return;
    this.cycleTime += dt;
    // Full cycle (day → evening → night → day) over 180s
    const period = 180;
    const t = (this.cycleTime % period) / period; // 0..1
    // Smoothly interpolate between 3 keyframes
    const keys = [
      {
        skyR: 0xa9c8e0,
        fog: 0xbcd0e0,
        hemi: 0xbfd8f0,
        hemig: 0x6b6253,
        sun: 0xfff1d6,
        sunI: 1.1,
        hemiI: 0.85,
      },
      {
        skyR: 0x6e4a55,
        fog: 0x4a3a3e,
        hemi: 0xd49070,
        hemig: 0x2a2030,
        sun: 0xff9a5a,
        sunI: 0.8,
        hemiI: 0.55,
      },
      {
        skyR: 0x0a0e1a,
        fog: 0x0a0e1a,
        hemi: 0x4a5a78,
        hemig: 0x0a0a14,
        sun: 0x7088b0,
        sunI: 0.35,
        hemiI: 0.4,
      },
    ];
    const seg = t * 3; // 0..3
    const i = Math.floor(seg) % 3;
    const f = seg - Math.floor(seg);
    const a = keys[i];
    const b = keys[(i + 1) % 3];
    const lerpColor = (c1: number, c2: number, k: number) =>
      new THREE.Color(c1).lerp(new THREE.Color(c2), k);
    const lerpNum = (n1: number, n2: number, k: number) => n1 + (n2 - n1) * k;

    (this.scene.background as THREE.Color).copy(lerpColor(a.skyR, b.skyR, f));
    this.scene.fog!.color.copy(lerpColor(a.fog, b.fog, f));
    this.hemi.color.copy(lerpColor(a.hemi, b.hemi, f));
    this.hemi.groundColor.copy(lerpColor(a.hemig, b.hemig, f));
    this.hemi.intensity = lerpNum(a.hemiI, b.hemiI, f);
    this.dirLight.color.copy(lerpColor(a.sun, b.sun, f));
    this.dirLight.intensity = lerpNum(a.sunI, b.sunI, f);
  }

  private spawnBots(n: number) {
    const spawns = this.getDefenderSpawns();
    for (let i = 0; i < n; i++) {
      const s = spawns[i % spawns.length];
      this.bots.push(this.createBot(s.x, s.z));
    }
  }

  private getDefenderSpawns() {
    const { defenderSpawn } = this.getMapLayout();
    return [
      new THREE.Vector3(defenderSpawn.x, 0, defenderSpawn.z),
      new THREE.Vector3(defenderSpawn.x - 7, 0, defenderSpawn.z + 4),
      new THREE.Vector3(defenderSpawn.x + 7, 0, defenderSpawn.z + 4),
      new THREE.Vector3(defenderSpawn.x - 12, 0, defenderSpawn.z + 9),
      new THREE.Vector3(defenderSpawn.x + 12, 0, defenderSpawn.z + 9),
    ];
  }

  private addObjectiveMarkers() {
    const layout = this.getMapLayout();
    const siteColors: Record<string, number> = { A: 0x5cffb0, B: 0xffd166, C: 0xff4d6d };
    const attackColor = 0x5cffb0;
    const defenseColor = 0xff4d6d;

    if (layout.mid) {
      for (const site of layout.sites) {
        this.addRouteLine(layout.attackerSpawn, layout.mid, attackColor, 0.16);
        this.addRouteLine(layout.mid, site, siteColors[site.key] ?? 0xffffff, 0.13);
        this.addRouteLine(layout.defenderSpawn, site, defenseColor, 0.1);
      }
    } else {
      for (const site of layout.sites) {
        this.addRouteLine(layout.attackerSpawn, site, siteColors[site.key] ?? attackColor, 0.13);
        this.addRouteLine(layout.defenderSpawn, site, defenseColor, 0.1);
      }
    }

    for (const site of layout.sites) {
      const color = siteColors[site.key] ?? 0xffffff;
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(site.radius - 0.2, site.radius, 72),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.78,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(site.x, 0.035, site.z);
      this.scene.add(ring);

      const fill = new THREE.Mesh(
        new THREE.CircleGeometry(site.radius - 0.35, 72),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.08,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      fill.rotation.x = -Math.PI / 2;
      fill.position.set(site.x, 0.032, site.z);
      this.scene.add(fill);

      const inner = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(1, site.radius * 0.42), Math.max(1.2, site.radius * 0.46), 72),
        new THREE.MeshBasicMaterial({
          color,
          transparent: true,
          opacity: 0.38,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      inner.rotation.x = -Math.PI / 2;
      inner.position.set(site.x, 0.05, site.z);
      this.scene.add(inner);

      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2;
        const tick = new THREE.Mesh(
          new THREE.BoxGeometry(0.16, 0.08, 1.05),
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.78 }),
        );
        tick.position.set(
          site.x + Math.cos(a) * (site.radius - 0.45),
          0.09,
          site.z + Math.sin(a) * (site.radius - 0.45),
        );
        tick.rotation.y = -a;
        this.scene.add(tick);
      }

      for (const [dx, dz] of [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as Array<[number, number]>) {
        this.addSitePylon(
          site.x + dx * (site.radius * 0.62),
          site.z + dz * (site.radius * 0.62),
          color,
        );
      }

      this.addBillboardLabel(`PLANT ${site.key}`, site.x, 2.8, site.z, color, site.description);
    }

    if (layout.mid) {
      const mid = new THREE.Mesh(
        new THREE.RingGeometry(3.3, 3.55, 48),
        new THREE.MeshBasicMaterial({
          color: 0x88c4ff,
          transparent: true,
          opacity: 0.5,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      mid.rotation.x = -Math.PI / 2;
      mid.position.set(layout.mid.x, 0.04, layout.mid.z);
      this.scene.add(mid);
      this.addBillboardLabel("MID", layout.mid.x, 2.3, layout.mid.z, 0x88c4ff, "Rotation lane");
    }

    this.addSpawnMarker("ATTACK", layout.attackerSpawn.x, layout.attackerSpawn.z, 0x5cffb0);
    this.addSpawnMarker("DEFENSE", layout.defenderSpawn.x, layout.defenderSpawn.z, 0xff4d6d);
  }

  private addRouteLine(
    from: { x: number; z: number },
    to: { x: number; z: number },
    color: number,
    opacity: number,
  ) {
    const dx = to.x - from.x;
    const dz = to.z - from.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) return;
    const lane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.45, len),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    lane.rotation.x = -Math.PI / 2;
    lane.rotation.z = Math.atan2(dx, dz);
    lane.position.set((from.x + to.x) / 2, 0.025, (from.z + to.z) / 2);
    this.scene.add(lane);
  }

  private addSitePylon(x: number, z: number, color: number) {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.16, 0.22, 0.55, 10),
      new THREE.MeshStandardMaterial({
        color: 0x111827,
        roughness: 0.55,
        metalness: 0.35,
        emissive: color,
        emissiveIntensity: 0.1,
      }),
    );
    base.position.set(x, 0.28, z);
    this.scene.add(base);

    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 12, 8),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    cap.position.set(x, 0.68, z);
    this.scene.add(cap);

    const light = new THREE.PointLight(color, 0.55, 5);
    light.position.set(x, 0.9, z);
    this.scene.add(light);
  }

  private addSpawnMarker(label: string, x: number, z: number, color: number) {
    const marker = new THREE.Mesh(
      new THREE.CircleGeometry(2.2, 32),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.18,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.set(x, 0.045, z);
    this.scene.add(marker);
    this.addBillboardLabel(label, x, 2.0, z, color);
  }

  private addBillboardLabel(
    text: string,
    x: number,
    y: number,
    z: number,
    color: number,
    subtext?: string,
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = 384;
    canvas.height = 104;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(7,10,18,0.82)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = `#${color.toString(16).padStart(6, "0")}`;
    ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
    ctx.fillStyle = "#ffffff";
    ctx.font = "800 34px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, subtext ? 38 : canvas.height / 2);
    if (subtext) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = "600 16px Arial";
      ctx.fillText(subtext.toUpperCase().slice(0, 34), canvas.width / 2, 76);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.set(6.4, 1.75, 1);
    this.scene.add(sprite);
  }

  private createBot(x: number, z: number): Bot {
    // Pick a random enemy agent from the roster (excluding the player's own agent)
    const playerAgentId = this.cfg.agent?.id;
    const pool = AGENTS.filter((a) => a.id !== playerAgentId);
    const agent = pool[Math.floor(Math.random() * pool.length)] ?? AGENTS[0];
    const g = buildAgentModel(agent);
    g.position.set(x, 0, z);
    this.scene.add(g);
    return {
      mesh: g,
      pos: g.position,
      vel: new THREE.Vector3(),
      hp: 100,
      armor: 25,
      alive: true,
      fireCd: 1 + Math.random(),
      target: new THREE.Vector3(x, 0, z),
      retargetIn: 0,
      flashed: 0,
    };
  }

  private reload() {
    if (this.run.reloading > 0 || this.run.mag === 25 || this.run.ammo === 0) return;
    this.run.reloading = 2;
  }

  private useAbility(k: AbilityKey) {
    const ab = this.run.abilities[k];
    if (ab.charges <= 0) return;
    if (ab.cd > 0 && ab.charges <= 0) return;

    const agent = this.cfg.agent;
    if (agent?.role === "Controller" && (k === "q" || k === "e" || k === "x")) {
      this.openSmokePlanner(k);
      return;
    }

    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    const target = this.playerPos.clone().add(forward.clone().multiplyScalar(k === "x" ? 14 : 10));
    target.y = 1.2;

    if (agent?.role === "Duelist") {
      this.useDuelistAbility(k, agent.id, target, forward);
    } else if (agent?.role === "Initiator") {
      this.useInitiatorAbility(k, agent.id, target, forward);
    } else if (agent?.role === "Sentinel") {
      this.useSentinelAbility(k, agent.id, target, forward);
    } else {
      this.useDuelistAbility(k, agent?.id, target, forward);
    }
    ab.charges--;
    if (ab.cd <= 0) ab.cd = ab.cooldown;
  }

  private spendAbility(k: AbilityKey) {
    const ab = this.run.abilities[k];
    ab.charges--;
    if (ab.cd <= 0) ab.cd = ab.cooldown;
  }

  private useDuelistAbility(
    k: AbilityKey,
    agentId: string | undefined,
    target: THREE.Vector3,
    forward: THREE.Vector3,
  ) {
    if (k === "c") {
      this.spawnFrag(target, 5.4, 85, this.cfg.agent?.hue ?? "#ffd166");
      return;
    }
    if (k === "q") {
      this.spawnFlash(target, this.cfg.agent?.hue ?? "#ffffff", 2);
      this.flashBotsFrom(target, 2.4);
      return;
    }
    if (k === "e") {
      this.useMobility(agentId, forward);
      return;
    }
    this.useUltimate(agentId, target, forward);
  }

  private useInitiatorAbility(
    k: AbilityKey,
    agentId: string | undefined,
    target: THREE.Vector3,
    forward: THREE.Vector3,
  ) {
    if (k === "c") {
      this.spawnFrag(target, 4, 45, this.cfg.agent?.hue ?? "#5cffb0");
      this.flashBotsFrom(target, 1.5);
      return;
    }
    if (k === "q") {
      this.flashBotsFrom(this.playerPos, agentId === "pulse" ? 3.5 : 2.8);
      this.run.message = agentId === "pulse" ? "Reveal: враги подсвечены" : "Flash: зона ослеплена";
      this.run.msgTimer = 1.8;
      return;
    }
    if (k === "e") {
      if (agentId === "nova") {
        this.spawnFrag(target, 4.5, 70, this.cfg.agent?.hue ?? "#ffd84a");
      } else {
        this.slowBotsNear(target, 8, 2);
      }
      return;
    }
    this.useUltimate(agentId, target, forward);
  }

  private useSentinelAbility(
    k: AbilityKey,
    agentId: string | undefined,
    target: THREE.Vector3,
    forward: THREE.Vector3,
  ) {
    if (k === "c") {
      this.spawnTrap(target, agentId);
      return;
    }
    if (k === "q") {
      if (agentId === "echo") {
        this.run.hp = Math.min(100, this.run.hp + 45);
        this.run.message = "Heal +45";
        this.run.msgTimer = 1.5;
      } else {
        this.spawnSmoke(target, 12, 3.5, this.cfg.agent?.hue);
        this.slowBotsNear(target, 6, 2.5);
      }
      return;
    }
    if (k === "e") {
      this.useMobility(agentId, forward);
      return;
    }
    this.useUltimate(agentId, target, forward);
  }

  private useUltimate(agentId: string | undefined, target: THREE.Vector3, forward: THREE.Vector3) {
    if (agentId === "frost" || agentId === "shadow") {
      this.spawnSmoke(target, 16, 5, this.cfg.agent?.hue);
      this.slowBotsNear(target, 8, 3);
      return;
    }
    if (agentId === "titan") {
      this.run.armor = Math.min(100, this.run.armor + 75);
      this.run.message = "Invincible: броня восстановлена";
      this.run.msgTimer = 2;
      return;
    }
    if (agentId === "echo") {
      this.run.hp = 100;
      this.run.armor = Math.min(75, this.run.armor + 35);
      this.run.message = "Revive: здоровье восстановлено";
      this.run.msgTimer = 2;
      return;
    }
    if (agentId === "ghost") {
      this.useMobility(agentId, forward, 10);
      this.flashBotsFrom(this.playerPos, 2.5);
      return;
    }
    if (agentId === "pulse") {
      this.flashBotsFrom(this.playerPos, 3.5);
      this.slowBotsNear(this.playerPos, 28, 2);
      return;
    }
    if (agentId === "volt") {
      this.useMobility(agentId, forward, 14);
      this.spawnFrag(target, 5, 65, this.cfg.agent?.hue ?? "#7df9ff");
      return;
    }

    const damage = agentId === "nova" ? 130 : 110;
    const radius = agentId === "blaze" || agentId === "phoenix" ? 7 : 5.5;
    this.spawnFrag(target, radius, damage, this.cfg.agent?.hue ?? "#ff5a2e");
  }

  private openSmokePlanner(k: AbilityKey) {
    if (this.smokePlanner) this.closeSmokePlanner(false);

    const selected = this.playerPos.clone();
    selected.y = 1.5;

    const overlay = document.createElement("div");
    overlay.style.position = "absolute";
    overlay.style.inset = "0";
    overlay.style.zIndex = "40";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.cursor = "crosshair";
    overlay.style.userSelect = "none";

    const panel = document.createElement("div");
    panel.style.width = "min(72vw, 460px)";
    panel.style.padding = "14px";
    panel.style.border = "1px solid rgba(255,255,255,0.22)";
    panel.style.background = "rgba(7, 10, 16, 0.92)";
    panel.style.boxShadow = "0 18px 60px rgba(0,0,0,0.45)";

    const title = document.createElement("div");
    title.textContent = "SMOKE MAP";
    title.style.color = this.cfg.agent?.hue ?? "#c8d0dd";
    title.style.font = "800 12px system-ui, sans-serif";
    title.style.letterSpacing = "0.24em";
    title.style.marginBottom = "10px";

    const hint = document.createElement("div");
    hint.textContent = "ПКМ выбирает точку. ЛКМ ставит смок. Esc отменяет.";
    hint.style.color = "rgba(255,255,255,0.68)";
    hint.style.font = "12px system-ui, sans-serif";
    hint.style.marginBottom = "12px";

    const map = document.createElement("div");
    map.style.position = "relative";
    map.style.aspectRatio = "1 / 1";
    map.style.width = "100%";
    map.style.border = "1px solid rgba(255,255,255,0.18)";
    map.style.background =
      "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), rgba(14, 18, 28, 0.96)";
    map.style.backgroundSize = "25% 25%";
    map.style.overflow = "hidden";

    const player = document.createElement("div");
    player.style.position = "absolute";
    player.style.left = "50%";
    player.style.top = "50%";
    player.style.width = "10px";
    player.style.height = "10px";
    player.style.borderRadius = "999px";
    player.style.background = "#ffffff";
    player.style.transform = "translate(-50%, -50%)";
    player.style.boxShadow = "0 0 16px #ffffff";
    map.appendChild(player);

    const marker = document.createElement("div");
    marker.style.position = "absolute";
    marker.style.left = "50%";
    marker.style.top = "50%";
    marker.style.width = "22px";
    marker.style.height = "22px";
    marker.style.borderRadius = "999px";
    marker.style.border = `2px solid ${this.cfg.agent?.hue ?? "#c8d0dd"}`;
    marker.style.transform = "translate(-50%, -50%)";
    marker.style.boxShadow = `0 0 20px ${this.cfg.agent?.hue ?? "#c8d0dd"}`;
    map.appendChild(marker);

    panel.append(title, hint, map);
    overlay.appendChild(panel);
    this.container.appendChild(overlay);

    const setSelectedFromEvent = (e: MouseEvent) => {
      const rect = map.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const world = this.mapToWorld(x, y);
      selected.copy(world);
      marker.style.left = `${x * 100}%`;
      marker.style.top = `${y * 100}%`;
    };

    map.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      setSelectedFromEvent(e);
    });
    map.addEventListener("mousedown", (e) => {
      e.preventDefault();
      if (e.button === 2) {
        setSelectedFromEvent(e);
        return;
      }
      if (e.button !== 0) return;
      setSelectedFromEvent(e);
      this.placePlannedSmoke();
    });

    this.smokePlanner = { key: k, overlay, map, marker, selected };
    if (document.pointerLockElement === this.renderer.domElement) document.exitPointerLock();
    this.run.message = "Выбери точку смока на мини-карте";
    this.run.msgTimer = 2;
  }

  private mapToWorld(x: number, y: number) {
    const size = 70;
    return new THREE.Vector3((x - 0.5) * size, 1.5, (y - 0.5) * size);
  }

  private placePlannedSmoke() {
    const planner = this.smokePlanner;
    const agent = this.cfg.agent;
    if (!planner || !agent) return;

    const duration = planner.key === "x" ? 16 : planner.key === "e" ? 14 : 12;
    const radius = agent.id === "frost" ? 4.8 : 4.3;
    this.spawnSmoke(planner.selected, duration, radius, agent.hue);
    if (agent.id === "frost") this.slowBotsNear(planner.selected, radius + 2, 2);
    if (agent.id === "shadow" && planner.key === "x") this.flashBotsFrom(planner.selected, 2);
    this.spendAbility(planner.key);
    this.closeSmokePlanner(true);
  }

  private closeSmokePlanner(placed: boolean) {
    if (!this.smokePlanner) return;
    this.smokePlanner.overlay.remove();
    this.smokePlanner = null;
    if (placed) {
      this.run.message = "Смок поставлен";
      this.run.msgTimer = 1.5;
    }
  }

  private useMobility(
    agentId: string | undefined,
    forward: THREE.Vector3,
    overrideDistance?: number,
  ) {
    if (agentId === "echo") {
      this.run.hp = Math.min(100, this.run.hp + 35);
      this.run.message = "Лечение +35";
      this.run.msgTimer = 1.5;
      return;
    }
    if (agentId === "titan") {
      this.run.armor = Math.min(100, this.run.armor + 35);
      this.run.message = "Броня +35";
      this.run.msgTimer = 1.5;
      return;
    }

    const fastDuelist = agentId === "volt" || agentId === "phoenix";
    const distance = overrideDistance ?? (fastDuelist ? 12 : 8);
    const dash = forward.clone();
    dash.y = 0;
    dash.normalize().multiplyScalar(distance);
    const start = this.playerPos.clone();
    const target = this.playerPos.clone().add(dash);
    const steps = 24;
    for (let i = 0; i < steps; i++) {
      const step = target
        .clone()
        .sub(this.playerPos)
        .multiplyScalar(1 / (steps - i));
      this.tryMove(step.x, step.z);
    }
    if (agentId === "phoenix") this.spawnFrag(start, 3.5, 35, this.cfg.agent?.hue ?? "#ff4d6d");
  }

  private spawnFlash(pos: THREE.Vector3, color = "#ffffff", duration = 2.5) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 12),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color) }),
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.flashMeshes.push({ mesh: m, life: 0.5 });
    if (this.hasLOS(this.playerPos, pos))
      this.run.flashed = Math.max(this.run.flashed, duration * 0.4);
  }

  private flashBotsFrom(pos: THREE.Vector3, duration: number) {
    for (const b of this.bots) {
      if (!b.alive) continue;
      if (this.hasLOS(b.pos.clone().setY(1.5), pos)) b.flashed = Math.max(b.flashed, duration);
    }
  }

  private slowBotsNear(pos: THREE.Vector3, radius: number, duration: number) {
    for (const b of this.bots) {
      if (!b.alive) continue;
      if (b.pos.distanceTo(pos) <= radius) b.flashed = Math.max(b.flashed, duration);
    }
  }

  private spawnFrag(pos: THREE.Vector3, radius: number, damage: number, color: string) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.35, 16, 16),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.8,
      }),
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.flashMeshes.push({ mesh: m, life: 0.35 });

    for (const b of [...this.bots]) {
      if (!b.alive) continue;
      const dist = b.pos.distanceTo(pos);
      if (dist <= radius && this.hasLOS(b.pos.clone().setY(1.2), pos)) {
        this.damageBot(b, damage * (1 - dist / (radius * 1.3)));
      }
    }
  }

  private spawnTrap(pos: THREE.Vector3, agentId: string | undefined) {
    const radius = agentId === "titan" ? 5 : 4;
    const damage = agentId === "ghost" ? 35 : 25;
    this.spawnFrag(pos, radius, damage, this.cfg.agent?.hue ?? "#b8b8c8");
    this.slowBotsNear(pos, radius + 2, agentId === "ghost" ? 3 : 2);
  }

  private spawnSmoke(pos: THREE.Vector3, duration = 12, radius = 4, color = "#c8d0dd") {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 24),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        transparent: true,
        opacity: 0.85,
        roughness: 1,
      }),
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.smokes.push({ mesh: m, life: Math.max(12, duration), pos: m.position, r: radius });
  }

  private hasLOS(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dir = b.clone().sub(a);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(a, dir, 0, dist);
    const hits = ray.intersectObjects(this.wallMeshes, false);
    if (hits.length > 0) return false;
    for (const s of this.smokes) {
      const closest = a
        .clone()
        .add(dir.clone().multiplyScalar(Math.min(dist, s.pos.clone().sub(a).dot(dir))));
      if (closest.distanceTo(s.pos) < s.r) return false;
    }
    return true;
  }

  private tryMove(dx: number, dz: number) {
    const r = this.playerRadius;
    const np = this.playerPos.clone();
    np.x += dx;
    const boxX = new THREE.Box3(
      new THREE.Vector3(np.x - r, 0, this.playerPos.z - r),
      new THREE.Vector3(np.x + r, this.playerHeight, this.playerPos.z + r),
    );
    if (!this.walls.some((w) => w.intersectsBox(boxX))) this.playerPos.x = np.x;
    np.x = this.playerPos.x;
    np.z += dz;
    const boxZ = new THREE.Box3(
      new THREE.Vector3(this.playerPos.x - r, 0, np.z - r),
      new THREE.Vector3(this.playerPos.x + r, this.playerHeight, np.z + r),
    );
    if (!this.walls.some((w) => w.intersectsBox(boxZ))) this.playerPos.z = np.z;
  }

  private botTryMove(b: Bot, dx: number, dz: number) {
    const r = 0.5;
    const np = b.pos.clone();
    np.x += dx;
    const bx = new THREE.Box3(
      new THREE.Vector3(np.x - r, 0, b.pos.z - r),
      new THREE.Vector3(np.x + r, 2, b.pos.z + r),
    );
    if (!this.walls.some((w) => w.intersectsBox(bx))) b.pos.x = np.x;
    np.x = b.pos.x;
    np.z += dz;
    const bz = new THREE.Box3(
      new THREE.Vector3(b.pos.x - r, 0, np.z - r),
      new THREE.Vector3(b.pos.x + r, 2, np.z + r),
    );
    if (!this.walls.some((w) => w.intersectsBox(bz))) b.pos.z = np.z;
    b.mesh.position.copy(b.pos);
  }

  private shoot() {
    const r = this.run;
    if (r.fireCd > 0 || r.mag <= 0 || r.reloading > 0 || r.flashed > 0) return;
    r.mag--;
    r.fireCd = 0.1;
    const moving =
      this.keys.has("w") || this.keys.has("a") || this.keys.has("s") || this.keys.has("d");
    const baseSpread = moving ? 0.04 : 0.005;
    const spread = baseSpread + r.spread;
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * spread;
    dir.y += (Math.random() - 0.5) * spread;
    dir.z += (Math.random() - 0.5) * spread;
    dir.normalize();

    const origin = this.playerPos.clone();
    const ray = new THREE.Raycaster(origin, dir, 0, 200);

    // hit bots first
    const botMeshes: THREE.Object3D[] = [];
    for (const b of this.bots)
      if (b.alive)
        b.mesh.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) botMeshes.push(o);
        });
    const allTargets = [...this.wallMeshes, ...botMeshes];
    const hits = ray.intersectObjects(allTargets, true);
    let hitPoint = origin.clone().add(dir.clone().multiplyScalar(80));
    if (hits.length > 0) {
      const h = hits[0];
      hitPoint = h.point;
      // find bot owning this mesh
      let obj: THREE.Object3D | null = h.object;
      while (obj && obj.parent && !this.bots.some((b) => b.mesh === obj)) obj = obj.parent;
      const bot = this.bots.find((b) => b.mesh === obj);
      if (bot && bot.alive) {
        const headHit = h.point.y > bot.pos.y + 1.5;
        const dmg = headHit ? 120 : 35;
        this.damageBot(bot, dmg);
      }
    }

    // tracer
    const geo = new THREE.BufferGeometry().setFromPoints([
      origin
        .clone()
        .add(dir.clone().multiplyScalar(0.5))
        .add(new THREE.Vector3(0, -0.1, 0)),
      hitPoint,
    ]);
    const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xffd166 }));
    this.scene.add(line);
    this.tracers.push({ line, life: 0.08 });
    r.spread = Math.min(0.18, r.spread + 0.025);
  }

  private damageBot(b: Bot, dmg: number) {
    if (b.armor > 0) {
      const a = Math.min(b.armor, dmg * 0.5);
      b.armor -= a;
      b.hp -= dmg - a;
    } else b.hp -= dmg;
    if (b.hp <= 0) {
      b.alive = false;
      this.scene.remove(b.mesh);
      this.run.kills++;
      this.cb.onKill?.();
      if (this.run.kills >= this.run.killsToWin) this.endMatch(true);
      else {
        // respawn a new bot after a delay for endless action (until killsToWin)
        setTimeout(() => {
          if (this.disposed || this.run.finished) return;
          const spawns = this.getDefenderSpawns();
          const sp = spawns[Math.floor(Math.random() * spawns.length)];
          this.bots.push(this.createBot(sp.x, sp.z));
        }, 1500);
      }
    }
  }

  private damagePlayer(dmg: number) {
    if (this.run.armor > 0) {
      const a = Math.min(this.run.armor, dmg * 0.5);
      this.run.armor -= a;
      this.run.hp -= dmg - a;
    } else this.run.hp -= dmg;
    if (this.run.hp <= 0) {
      this.run.deaths++;
      // respawn unless lethal threshold reached
      if (this.run.deaths >= 5) {
        this.endMatch(false);
        return;
      }
      this.run.hp = 100;
      this.run.armor = 50;
      this.run.mag = 25;
      this.run.ammo = 90;
      const spawn = this.getMapLayout().attackerSpawn;
      this.playerPos.set(spawn.x, this.playerHeight, spawn.z);
      this.run.message = `Respawn — смертей ${this.run.deaths}/5`;
      this.run.msgTimer = 2;
      this.cb.onRespawn?.();
    }
  }

  private endMatch(won: boolean) {
    if (this.run.finished) return;
    this.run.finished = true;
    this.run.won = won;
    this.run.message = won ? "ПОБЕДА" : "ПОРАЖЕНИЕ";
    this.run.msgTimer = 999;
    setTimeout(() => {
      this.cb.onEnd({ won, kills: this.run.kills });
    }, 2000);
  }

  private updateObjective(dt: number) {
    const objective = this.run.objective;
    if (this.paused || objective.phase === "detonated") {
      objective.canPlant = false;
      if (objective.phase === "planting") {
        objective.phase = "carried";
        objective.plantProgress = 0;
      }
      return;
    }

    if (objective.phase === "planted") {
      objective.canPlant = false;
      objective.timeLeft = Math.max(0, objective.timeLeft - dt);
      if (this.plantedPack) {
        this.plantedPack.rotation.y += dt * 0.8;
        const urgent = objective.timeLeft < 10;
        const pulse = urgent ? 2.3 : 1.2;
        const blink = (Math.sin(performance.now() / (urgent ? 80 : 180)) + 1) / 2;
        this.plantedPack.scale.setScalar(1 + blink * 0.035);
        if (this.plantedPackLight) this.plantedPackLight.intensity = pulse + blink * pulse;
      }
      if (objective.timeLeft <= 0) {
        objective.phase = "detonated";
        this.run.message = "PACK DETONATED";
        this.run.msgTimer = 4;
        if (this.plantedPack) {
          this.spawnFrag(this.plantedPack.position.clone().setY(1), 8, 120, "#ffd166");
        }
      }
      return;
    }

    const site = this.getCurrentPlantSite();
    objective.site = site?.key ?? null;
    objective.canPlant = !!site && objective.carryingPack;

    if (!site || !objective.carryingPack || !this.keys.has("f")) {
      if (objective.phase === "planting") {
        objective.phase = "carried";
        objective.plantProgress = 0;
      }
      return;
    }

    objective.phase = "planting";
    objective.plantProgress = Math.min(objective.plantDuration, objective.plantProgress + dt);
    this.run.message = `Planting ${site.key}`;
    this.run.msgTimer = 0.25;

    if (objective.plantProgress >= objective.plantDuration) {
      this.completePlant(site);
    }
  }

  private getCurrentPlantSite() {
    return this.getMapLayout().sites.find((site) => {
      const dx = this.playerPos.x - site.x;
      const dz = this.playerPos.z - site.z;
      return Math.hypot(dx, dz) <= site.radius;
    });
  }

  private completePlant(site: NonNullable<ReturnType<FPSEngine["getCurrentPlantSite"]>>) {
    const objective = this.run.objective;
    objective.carryingPack = false;
    objective.canPlant = false;
    objective.phase = "planted";
    objective.site = site.key;
    objective.plantProgress = objective.plantDuration;
    objective.timeLeft = objective.detonateAfter;
    this.run.message = `PACK PLANTED ON ${site.key}`;
    this.run.msgTimer = 3;

    this.clearPlantedPack();
    this.plantedPack = this.createPackMesh(site.x, site.z);
    this.scene.add(this.plantedPack);
  }

  private createPackMesh(x: number, z: number) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.28, 0.75),
      new THREE.MeshStandardMaterial({
        color: 0x10151f,
        roughness: 0.45,
        metalness: 0.35,
        emissive: 0x301200,
        emissiveIntensity: 0.3,
      }),
    );
    body.position.y = 0.18;
    group.add(body);

    const screen = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.04, 0.28),
      new THREE.MeshBasicMaterial({ color: 0xffd166 }),
    );
    screen.position.set(0, 0.36, 0);
    group.add(screen);

    const antenna = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.9, 8),
      new THREE.MeshBasicMaterial({ color: 0xff4d6d }),
    );
    antenna.position.set(0.45, 0.7, -0.25);
    antenna.rotation.z = 0.35;
    group.add(antenna);

    const pulse = new THREE.PointLight(0xffd166, 1.5, 8);
    pulse.position.set(0, 0.7, 0);
    group.add(pulse);
    this.plantedPackLight = pulse;

    const strapMat = new THREE.MeshStandardMaterial({ color: 0x2c3442, roughness: 0.7, metalness: 0.2 });
    for (const xOff of [-0.32, 0.32]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.08, 0.86), strapMat);
      strap.position.set(xOff, 0.38, 0);
      group.add(strap);
    }

    const wireMat = new THREE.MeshBasicMaterial({ color: 0xff4d6d });
    for (const [xOff, zOff, rot] of [
      [-0.28, -0.18, 0.4],
      [0.12, 0.18, -0.25],
      [0.34, 0.06, 0.9],
    ] as Array<[number, number, number]>) {
      const wire = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 6, 24), wireMat);
      wire.position.set(xOff, 0.42, zOff);
      wire.rotation.set(Math.PI / 2, 0, rot);
      group.add(wire);
    }

    for (const [xOff, zOff, color] of [
      [-0.42, 0.26, 0x5cffb0],
      [-0.2, 0.28, 0xffd166],
      [0.02, 0.28, 0xff4d6d],
    ] as Array<[number, number, number]>) {
      const led = new THREE.Mesh(
        new THREE.SphereGeometry(0.055, 10, 8),
        new THREE.MeshBasicMaterial({ color }),
      );
      led.position.set(xOff, 0.43, zOff);
      group.add(led);
    }

    const keypadMat = new THREE.MeshBasicMaterial({ color: 0x9fb3c8 });
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 3; col++) {
        const key = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.018, 0.055), keypadMat);
        key.position.set(0.23 + col * 0.075, 0.435, -0.18 + row * 0.075);
        group.add(key);
      }
    }

    const halo = new THREE.Mesh(
      new THREE.RingGeometry(0.95, 1.12, 56),
      new THREE.MeshBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    halo.rotation.x = -Math.PI / 2;
    halo.position.y = 0.02;
    group.add(halo);

    group.position.set(x, 0.04, z);
    return group;
  }

  private clearPlantedPack() {
    if (!this.plantedPack) return;
    this.scene.remove(this.plantedPack);
    this.plantedPack.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((m) => m.dispose());
      else material?.dispose?.();
    });
    this.plantedPack = null;
    this.plantedPackLight = null;
  }

  private update(dt: number) {
    if (this.run.finished) return;
    const r = this.run;
    r.msgTimer = Math.max(0, r.msgTimer - dt);
    this.updateCycle(dt);

    // camera rotation
    const euler = new THREE.Euler(this.pitch, this.yaw, 0, "YXZ");
    this.camera.quaternion.setFromEuler(euler);

    // movement
    const speed = 7;
    const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let mx = 0,
      mz = 0;
    if (this.keys.has("w")) {
      mx -= forward.x;
      mz -= forward.z;
    }
    if (this.keys.has("s")) {
      mx += forward.x;
      mz += forward.z;
    }
    if (this.keys.has("a")) {
      mx -= right.x;
      mz -= right.z;
    }
    if (this.keys.has("d")) {
      mx += right.x;
      mz += right.z;
    }
    const len = Math.hypot(mx, mz);
    if (len > 0) {
      mx /= len;
      mz /= len;
    }
    this.tryMove(mx * speed * dt, mz * speed * dt);
    this.camera.position.copy(this.playerPos);
    this.updateObjective(dt);

    // reload + fire
    if (r.reloading > 0) {
      r.reloading -= dt;
      if (r.reloading <= 0) {
        const need = 25 - r.mag;
        const take = Math.min(need, r.ammo);
        r.mag += take;
        r.ammo -= take;
      }
    }
    r.fireCd = Math.max(0, r.fireCd - dt);
    if (this.mouseDown && this.pointerLocked) this.shoot();
    r.spread = Math.max(0, r.spread - dt * 0.5);
    if (r.flashed > 0) r.flashed -= dt;

    // abilities cd
    for (const k of ["c", "q", "e", "x"] as AbilityKey[]) {
      const ab = r.abilities[k];
      if (ab.charges < ab.max) {
        ab.cd -= dt;
        if (ab.cd <= 0) {
          ab.charges++;
          ab.cd = ab.cooldown;
        }
      }
    }

    // tracers
    for (const t of this.tracers) {
      t.life -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.08);
      (t.line.material as THREE.LineBasicMaterial).transparent = true;
    }
    this.tracers = this.tracers.filter((t) => {
      if (t.life <= 0) {
        this.scene.remove(t.line);
        t.line.geometry.dispose();
        return false;
      }
      return true;
    });

    // flashes
    for (const f of this.flashMeshes) {
      f.life -= dt;
      f.mesh.scale.setScalar(1 + (0.5 - f.life) * 4);
      (f.mesh.material as THREE.MeshBasicMaterial).transparent = true;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, f.life / 0.5);
      // flash player if facing
      if (f.life > 0.4) {
        const dir = f.mesh.position.clone().sub(this.playerPos).normalize();
        const cam = new THREE.Vector3();
        this.camera.getWorldDirection(cam);
        if (dir.dot(cam) > 0.3 && this.hasLOS(this.playerPos, f.mesh.position)) {
          r.flashed = Math.max(r.flashed, 2);
        }
      }
    }
    this.flashMeshes = this.flashMeshes.filter((f) => {
      if (f.life <= 0) {
        this.scene.remove(f.mesh);
        return false;
      }
      return true;
    });

    // smokes
    for (const s of this.smokes) s.life -= dt;
    this.smokes = this.smokes.filter((s) => {
      if (s.life <= 0) {
        this.scene.remove(s.mesh);
        return false;
      }
      const op = Math.min(0.85, s.life / 2);
      (s.mesh.material as THREE.MeshStandardMaterial).opacity = op;
      return true;
    });

    // bots — frozen during round buy phase
    if (this.paused) return;
    for (const b of this.bots) {
      if (!b.alive) continue;

      if (b.flashed > 0) {
        b.flashed -= dt;
        continue;
      }
      const toPlayer = this.playerPos.clone().sub(b.pos);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      const sees =
        dist < 50 && this.hasLOS(b.pos.clone().setY(1.5), this.playerPos.clone().setY(1.5));
      // face player when sees
      if (sees) {
        const a = Math.atan2(toPlayer.x, toPlayer.z);
        b.mesh.rotation.y = a;
        // strafe
        const strafeDir = Math.sin(performance.now() / 1000 + b.pos.x) > 0 ? 1 : -1;
        const right = new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)).multiplyScalar(strafeDir);
        this.botTryMove(b, right.x * 2 * dt, right.z * 2 * dt);
        // hold distance
        if (dist > 25) {
          const fwd = toPlayer.clone().normalize();
          this.botTryMove(b, fwd.x * 3 * dt, fwd.z * 3 * dt);
        }
        b.fireCd -= dt;
        if (b.fireCd <= 0) {
          b.fireCd = 0.4 + Math.random() * 0.3;
          // accuracy
          if (Math.random() < 0.45) {
            this.damagePlayer(12);
            // muzzle tracer
            const start = b.pos.clone().setY(1.4);
            const end = this.playerPos.clone();
            const geo = new THREE.BufferGeometry().setFromPoints([start, end]);
            const line = new THREE.Line(
              geo,
              new THREE.LineBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 1 }),
            );
            this.scene.add(line);
            this.tracers.push({ line, life: 0.08 });
          } else {
            // visible miss tracer
            const off = new THREE.Vector3(
              (Math.random() - 0.5) * 4,
              (Math.random() - 0.5) * 2,
              (Math.random() - 0.5) * 4,
            );
            const geo = new THREE.BufferGeometry().setFromPoints([
              b.pos.clone().setY(1.4),
              this.playerPos.clone().add(off),
            ]);
            const line = new THREE.Line(
              geo,
              new THREE.LineBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.6 }),
            );
            this.scene.add(line);
            this.tracers.push({ line, life: 0.06 });
          }
        }
      } else {
        // wander toward player
        b.retargetIn -= dt;
        if (b.retargetIn <= 0) {
          b.retargetIn = 2;
        }
        if (dist > 1) {
          const fwd = toPlayer.clone().normalize();
          this.botTryMove(b, fwd.x * 2.5 * dt, fwd.z * 2.5 * dt);
          b.mesh.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
        }
      }
    }

    // ===== Multiplayer: broadcast self + sync remote avatars =====
    if (this.mp) {
      this.mp.tick(this.playerPos.x, this.playerPos.z, this.yaw);
      // add/update remote meshes
      const seen = new Set<string>();
      for (const [id, p] of this.mp.remotes) {
        seen.add(id);
        let g = this.remoteMeshes.get(id);
        if (!g) {
          g = this.createRemoteAvatar(p.name);
          this.remoteMeshes.set(id, g);
          this.scene.add(g);
        }
        g.position.set(p.x, 0, p.z);
        g.rotation.y = p.yaw;
      }
      // remove gone
      for (const [id, g] of this.remoteMeshes) {
        if (!seen.has(id)) {
          this.scene.remove(g);
          this.remoteMeshes.delete(id);
        }
      }
      r.onlinePlayers = this.mp.remotes.size + 1;
    }

    this.cb.onState({ ...r, abilities: { ...r.abilities }, objective: { ...r.objective } });
  }

  private createRemoteAvatar(_name: string): THREE.Group {
    // Remote players spawn with a random agent for visual variety
    const agent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
    return buildAgentModel(agent);
  }

  private loop = () => {
    if (this.disposed) return;
    const dt = Math.min(0.033, this.clock.getDelta());
    this.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.raf = requestAnimationFrame(this.loop);
  };

  getRun() {
    return this.run;
  }

  // ===== Round-system helpers (used by FPSGame HUD) =====
  setPaused(v: boolean) {
    this.paused = v;
  }
  getMapHalfSize() {
    return 40;
  }
  getObjectiveLayout() {
    return this.getMapLayout();
  }
  getPlayerSnapshot() {
    return { x: this.playerPos.x, z: this.playerPos.z, yaw: this.yaw };
  }
  getBotSnapshots() {
    return this.bots.map((b) => ({ x: b.pos.x, z: b.pos.z, alive: b.alive }));
  }
  /** Reset per-round player state without disposing the engine. */
  resetForRound() {
    const r = this.run;
    r.hp = 100;
    r.armor = 50;
    r.mag = 25;
    r.ammo = 90;
    r.reloading = 0;
    r.fireCd = 0;
    r.spread = 0;
    r.flashed = 0;
    r.kills = 0;
    r.deaths = 0;
    r.message = "";
    r.msgTimer = 0;
    r.objective = {
      carryingPack: true,
      canPlant: false,
      site: null,
      phase: "carried",
      plantProgress: 0,
      plantDuration: 3,
      timeLeft: 40,
      detonateAfter: 40,
    };
    this.clearPlantedPack();

    const layout = this.getMapLayout();
    this.playerPos.set(layout.attackerSpawn.x, this.playerHeight, layout.attackerSpawn.z);
    this.playerVel.set(0, 0, 0);
    this.yaw = Math.PI;

    const spawns = this.getDefenderSpawns();
    for (let i = 0; i < this.bots.length; i++) {
      const b = this.bots[i];
      const sp = spawns[i % spawns.length];
      b.alive = true;
      b.hp = 100;
      b.armor = 30;
      b.vel.set(0, 0, 0);
      b.pos.set(sp.x, 0, sp.z);
      b.target.copy(b.pos);
      b.mesh.position.copy(b.pos);
      b.mesh.visible = true;
      if (!b.mesh.parent) this.scene.add(b.mesh);
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.mp?.stop();
    this.mp = null;
    this.clearPlantedPack();
    this.closeSmokePlanner(false);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    this.renderer.domElement.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    window.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    window.removeEventListener("resize", this.onResize);
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
