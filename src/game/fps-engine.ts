import * as THREE from "three";
import type { Bot, GameConfig, RunState, SmokeOrb, Tracer, AbilityKey } from "./types";
import { makeRun } from "./types";
import type { Settings } from "./settings";
import { Multiplayer } from "./multiplayer";
import { buildAgentModel } from "./agent-model";
import { AGENTS } from "./data/agents";

// Map physical key codes -> logical action so the game works regardless of
// keyboard layout (русская/английская и т.п.)
const CODE_MAP: Record<string, string> = {
  KeyW: "w", KeyA: "a", KeyS: "s", KeyD: "d",
  KeyR: "r", KeyQ: "q", KeyE: "e", KeyX: "x",
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
  private flashMeshes: { mesh: THREE.Mesh; life: number }[] = [];

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
  private cycleTime = 0;        // seconds since match start, only used if dynamicCycle
  private dynamicCycle = false;

  private onKeyDown = (e: KeyboardEvent) => {
    const k = CODE_MAP[e.code];
    if (!k) return;
    this.keys.add(k);
    if (k === "r") this.reload();
    if (k === "q" || k === "e" || k === "x") this.useAbility(k as AbilityKey);
  };
  private onKeyUp = (e: KeyboardEvent) => {
    const k = CODE_MAP[e.code];
    if (k) this.keys.delete(k);
  };
  private onMouseDown = (e: MouseEvent) => {
    if (!this.pointerLocked) {
      this.renderer.domElement.requestPointerLock();
      return;
    }
    if (e.button === 0) this.mouseDown = true;
  };
  private onMouseUp = (e: MouseEvent) => { if (e.button === 0) this.mouseDown = false; };
  private onMouseMove = (e: MouseEvent) => {
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

    const pixelRatio =
      settings.graphics === "low" ? 0.7 :
      settings.graphics === "medium" ? Math.min(window.devicePixelRatio, 1.25) :
      Math.min(window.devicePixelRatio, 2);
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.graphics !== "low" });
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(container.clientWidth, container.clientHeight, false);
    this.renderer.shadowMap.enabled = false;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.cursor = "crosshair";

    this.camera = new THREE.PerspectiveCamera(settings.fov, container.clientWidth / container.clientHeight, 0.1, 500);
    const pal = this.getPalette();
    this.dynamicCycle = !!cfg.dynamicCycle;
    this.scene.background = new THREE.Color(pal.sky);
    const fogNear = settings.graphics === "low" ? 20 : settings.graphics === "medium" ? 30 : 50;
    const fogFar = settings.graphics === "low" ? 60 : settings.graphics === "medium" ? 90 : 140;
    this.scene.fog = new THREE.Fog(pal.fog, fogNear, fogFar);

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

  /** Compute palette from map theme + time of day. */
  private getPalette() {
    const theme = this.cfg.mapTheme || "urban";
    const tod = this.cfg.timeOfDay || "day";

    // Per-theme base material colors (natural materials, low saturation)
    const themeCols: Record<string, { ground: number; wall: number; accent: number; crate: number; rough: number; metal: number }> = {
      desert:  { ground: 0xc69b6a, wall: 0xa8896a, accent: 0x6b4a2a, crate: 0x8b5a2b, rough: 0.95, metal: 0.0 },
      arctic:  { ground: 0xdde9f1, wall: 0xa6b7c4, accent: 0x6a8aa3, crate: 0x5a6a78, rough: 0.7,  metal: 0.25 },
      temple:  { ground: 0x4f6b3a, wall: 0x7a7466, accent: 0x3d5a2a, crate: 0x6b4a2a, rough: 0.9,  metal: 0.05 },
      urban:   { ground: 0x6a6e72, wall: 0x8a8e93, accent: 0x3a3d42, crate: 0x6b4a2a, rough: 0.85, metal: 0.15 },
      neon:    { ground: 0x1e2236, wall: 0x3a4358, accent: 0x22ddee, crate: 0x444c66, rough: 0.6,  metal: 0.25 },
    };

    // Per-time-of-day sky/fog/light tint
    const todCols: Record<string, { sky: number; fog: number; hemiSky: number; hemiGround: number; sunCol: number; sunInt: number; hemiInt: number }> = {
      day:     { sky: 0xa9c8e0, fog: 0xbcd0e0, hemiSky: 0xbfd8f0, hemiGround: 0x6b6253, sunCol: 0xfff1d6, sunInt: 1.1, hemiInt: 0.85 },
      evening: { sky: 0x6e4a55, fog: 0x4a3a3e, hemiSky: 0xd49070, hemiGround: 0x2a2030, sunCol: 0xff9a5a, sunInt: 0.8, hemiInt: 0.55 },
      night:   { sky: 0x0a0e1a, fog: 0x0a0e1a, hemiSky: 0x4a5a78, hemiGround: 0x0a0a14, sunCol: 0x7088b0, sunInt: 0.35, hemiInt: 0.4 },
    };

    const t = themeCols[theme];
    const s = todCols[tod];
    return { ...t, ...s };
  }

  private buildLevel() {
    const pal = this.getPalette();

    // ===== Lights =====
    this.hemi = new THREE.HemisphereLight(pal.hemiSky, pal.hemiGround, pal.hemiInt);
    this.scene.add(this.hemi);
    this.dirLight = new THREE.DirectionalLight(pal.sunCol, pal.sunInt);
    this.dirLight.position.set(30, 60, 20);
    this.scene.add(this.dirLight);

    // Theme accent fills (warm lanterns in temple, cold pools in arctic, neon in neon city...)
    const theme = this.cfg.mapTheme || "urban";
    const accentSpots: Array<[number, number, number]> = [[-12, 3, 0], [12, 3, 0], [0, 3, -12], [0, 3, 12]];
    const accentCol =
      theme === "neon"   ? 0x22ddee :
      theme === "desert" ? 0xffb070 :
      theme === "arctic" ? 0x88c4ff :
      theme === "temple" ? 0xffae55 :
                           0xffc080;
    const accentInt = theme === "neon" ? 1.2 : 0.55;
    for (const [x, y, z] of accentSpots) {
      const p = new THREE.PointLight(accentCol, accentInt, 30);
      p.position.set(x, y, z);
      this.scene.add(p);
      this.ambientAccent.push(p);
    }

    // ===== Ground =====
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(120, 120, 1, 1),
      new THREE.MeshStandardMaterial({ color: pal.ground, roughness: pal.rough, metalness: pal.metal * 0.3 }),
    );
    ground.rotation.x = -Math.PI / 2;
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
      [0, -40, 80, 1, 5], [0, 40, 80, 1, 5],
      [-40, 0, 1, 80, 5], [40, 0, 1, 80, 5],
      // central building 30x30 with door gaps
      [-10.5, -15, 9, 1, 4], [10.5, -15, 9, 1, 4],
      [-10.5, 15, 9, 1, 4], [10.5, 15, 9, 1, 4],
      [-15, -10.5, 1, 9, 4], [-15, 10.5, 1, 9, 4],
      [15, -10.5, 1, 9, 4], [15, 10.5, 1, 9, 4],
      // internal cross divider
      [-9, 0, 12, 1, 3.5], [9, 0, 12, 1, 3.5],
      [0, -9, 1, 12, 3.5], [0, 9, 1, 12, 3.5],
      // pillars at building corners
      [-14, -14, 1.5, 1.5, 4.5], [14, -14, 1.5, 1.5, 4.5],
      [-14, 14, 1.5, 1.5, 4.5], [14, 14, 1.5, 1.5, 4.5],
      // crates inside rooms (low cover)
      [-9, -9, 1.6, 1.6, 1.4], [-5, -11, 1.6, 1.6, 1.4],
      [9, -9, 1.6, 1.6, 1.4], [11, -5, 1.6, 1.6, 1.4],
      [-9, 9, 1.6, 1.6, 1.4], [9, 9, 1.6, 1.6, 1.4],
      [-11, 5, 1.6, 1.6, 1.4], [5, 11, 1.6, 1.6, 1.4],
      // outdoor cover
      [-25, -10, 2, 6, 2.2], [25, 10, 2, 6, 2.2],
      [-10, -25, 6, 2, 2.2], [10, 25, 6, 2, 2.2],
      [-30, 0, 1.5, 8, 3], [30, 0, 1.5, 8, 3],
      [0, -30, 8, 1.5, 3], [0, 30, 8, 1.5, 3],
      // outer corner pillars
      [-32, -32, 2, 2, 5], [32, -32, 2, 2, 5],
      [-32, 32, 2, 2, 5], [32, 32, 2, 2, 5],
      // long sight-blocker walls between spawns
      [-22, -22, 8, 1, 3], [22, 22, 8, 1, 3],
      [-22, 22, 1, 8, 3], [22, -22, 1, 8, 3],
    ];

    const wallMat = new THREE.MeshStandardMaterial({ color: pal.wall, roughness: pal.rough, metalness: pal.metal });
    const crateMat = new THREE.MeshStandardMaterial({ color: pal.crate, roughness: 0.85, metalness: 0.05 });
    for (const [x, z, w, d, h] of wallDefs) {
      // crates (low boxes ≤ 1.6 tall) get the wood/crate material
      const isCrate = h <= 1.6;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), isCrate ? crateMat : wallMat);
      mesh.position.set(x, h / 2, z);
      this.scene.add(mesh);
      this.wallMeshes.push(mesh);
      this.walls.push(new THREE.Box3().setFromObject(mesh));
    }

    // ===== Theme decoration (no collision) =====
    if (theme === "desert") {
      // scattered rocks
      const rockMat = new THREE.MeshStandardMaterial({ color: 0x7a6a55, roughness: 1 });
      const rockSpots: Array<[number, number, number]> = [
        [-28, 0, 8], [26, 0, -6], [-18, 0, 28], [20, 0, 22], [-34, 0, -20], [34, 0, 18],
      ];
      for (const [x, y, z] of rockSpots) {
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.8 + Math.random() * 0.6), rockMat);
        r.position.set(x, y + 0.4, z);
        r.rotation.set(Math.random(), Math.random(), Math.random());
        this.scene.add(r);
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
    } else if (theme === "arctic") {
      // snow mounds
      const snowMat = new THREE.MeshStandardMaterial({ color: 0xeef4fa, roughness: 0.9 });
      const spots: Array<[number, number]> = [[-26, 18], [22, -22], [-20, -28], [28, 26], [-34, 4]];
      for (const [x, z] of spots) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 8), snowMat);
        s.position.set(x, 0.2, z);
        s.scale.y = 0.35;
        this.scene.add(s);
      }
    } else if (theme === "neon") {
      // keep tasteful neon strips (dialed down from before)
      const neonCyanMat = new THREE.MeshBasicMaterial({ color: 0x22ddee });
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
    }

    // ===== Ceiling tiles over the central building =====
    const ceilMat = new THREE.MeshStandardMaterial({ color: pal.accent, roughness: 0.9, metalness: pal.metal });
    const ceilingTiles = [
      [-7.5, 4.2, -7.5, 13, 13],
      [7.5, 4.2, -7.5, 13, 13],
      [-7.5, 4.2, 7.5, 13, 13],
      [7.5, 4.2, 7.5, 13, 13],
    ];
    for (const [cx, cy, cz, cw, cd] of ceilingTiles) {
      const c = new THREE.Mesh(new THREE.BoxGeometry(cw, 0.2, cd), ceilMat);
      c.position.set(cx, cy, cz);
      this.scene.add(c);
    }
  }

  /** Drive the day → evening → night cycle (only when dynamicCycle is on). */
  private updateCycle(dt: number) {
    if (!this.dynamicCycle) return;
    this.cycleTime += dt;
    // Full cycle (day → evening → night → day) over 180s
    const period = 180;
    const t = (this.cycleTime % period) / period; // 0..1
    // Smoothly interpolate between 3 keyframes
    const keys = [
      { skyR: 0xa9c8e0, fog: 0xbcd0e0, hemi: 0xbfd8f0, hemig: 0x6b6253, sun: 0xfff1d6, sunI: 1.1, hemiI: 0.85 },
      { skyR: 0x6e4a55, fog: 0x4a3a3e, hemi: 0xd49070, hemig: 0x2a2030, sun: 0xff9a5a, sunI: 0.8, hemiI: 0.55 },
      { skyR: 0x0a0e1a, fog: 0x0a0e1a, hemi: 0x4a5a78, hemig: 0x0a0a14, sun: 0x7088b0, sunI: 0.35, hemiI: 0.4 },
    ];
    const seg = t * 3; // 0..3
    const i = Math.floor(seg) % 3;
    const f = seg - Math.floor(seg);
    const a = keys[i];
    const b = keys[(i + 1) % 3];
    const lerpColor = (c1: number, c2: number, k: number) => new THREE.Color(c1).lerp(new THREE.Color(c2), k);
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
    const spawns = [
      new THREE.Vector3(28, 0, 28), new THREE.Vector3(-28, 0, 28),
      new THREE.Vector3(28, 0, -28), new THREE.Vector3(-28, 0, -28),
      new THREE.Vector3(0, 0, 32), new THREE.Vector3(32, 0, 0), new THREE.Vector3(-32, 0, 0),
    ];
    for (let i = 0; i < n; i++) {
      const s = spawns[i % spawns.length];
      this.bots.push(this.createBot(s.x, s.z));
    }
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
      mesh: g, pos: g.position, vel: new THREE.Vector3(),
      hp: 100, armor: 25, alive: true, fireCd: 1 + Math.random(),
      target: new THREE.Vector3(x, 0, z), retargetIn: 0, flashed: 0,
    };
  }

  private reload() {
    if (this.run.reloading > 0 || this.run.mag === 25 || this.run.ammo === 0) return;
    this.run.reloading = 2;
  }

  private useAbility(k: AbilityKey) {
    const ab = this.run.abilities[k];
    if (ab.charges <= 0) return;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    if (k === "q") {
      const pos = this.playerPos.clone().add(forward.clone().multiplyScalar(8));
      this.spawnFlash(pos);
      for (const b of this.bots) {
        if (!b.alive) continue;
        if (this.hasLOS(b.pos.clone().setY(1.5), pos)) b.flashed = 2.5;
      }
    } else if (k === "e") {
      const dash = forward.clone(); dash.y = 0; dash.normalize().multiplyScalar(8);
      const target = this.playerPos.clone().add(dash);
      const steps = 20;
      for (let i = 0; i < steps; i++) {
        const step = target.clone().sub(this.playerPos).multiplyScalar(1 / (steps - i));
        this.tryMove(step.x, step.z);
      }
    } else if (k === "x") {
      const pos = this.playerPos.clone().add(forward.clone().multiplyScalar(10));
      pos.y = 1.5;
      this.spawnSmoke(pos);
    }
    ab.charges--;
    if (ab.cd <= 0) ab.cd = ab.cooldown;
  }

  private spawnFlash(pos: THREE.Vector3) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(0.6, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff })
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.flashMeshes.push({ mesh: m, life: 0.5 });
  }

  private spawnSmoke(pos: THREE.Vector3) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(4, 24, 24),
      new THREE.MeshStandardMaterial({ color: 0xc8d0dd, transparent: true, opacity: 0.85, roughness: 1 })
    );
    m.position.copy(pos);
    this.scene.add(m);
    this.smokes.push({ mesh: m, life: 12, pos: m.position, r: 4 });
  }

  private hasLOS(a: THREE.Vector3, b: THREE.Vector3): boolean {
    const dir = b.clone().sub(a);
    const dist = dir.length();
    dir.normalize();
    const ray = new THREE.Raycaster(a, dir, 0, dist);
    const hits = ray.intersectObjects(this.wallMeshes, false);
    if (hits.length > 0) return false;
    for (const s of this.smokes) {
      const closest = a.clone().add(dir.clone().multiplyScalar(Math.min(dist, s.pos.clone().sub(a).dot(dir))));
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
      new THREE.Vector3(np.x + r, this.playerHeight, this.playerPos.z + r)
    );
    if (!this.walls.some(w => w.intersectsBox(boxX))) this.playerPos.x = np.x;
    np.x = this.playerPos.x;
    np.z += dz;
    const boxZ = new THREE.Box3(
      new THREE.Vector3(this.playerPos.x - r, 0, np.z - r),
      new THREE.Vector3(this.playerPos.x + r, this.playerHeight, np.z + r)
    );
    if (!this.walls.some(w => w.intersectsBox(boxZ))) this.playerPos.z = np.z;
  }

  private botTryMove(b: Bot, dx: number, dz: number) {
    const r = 0.5;
    const np = b.pos.clone();
    np.x += dx;
    const bx = new THREE.Box3(
      new THREE.Vector3(np.x - r, 0, b.pos.z - r),
      new THREE.Vector3(np.x + r, 2, b.pos.z + r)
    );
    if (!this.walls.some(w => w.intersectsBox(bx))) b.pos.x = np.x;
    np.x = b.pos.x;
    np.z += dz;
    const bz = new THREE.Box3(
      new THREE.Vector3(b.pos.x - r, 0, np.z - r),
      new THREE.Vector3(b.pos.x + r, 2, np.z + r)
    );
    if (!this.walls.some(w => w.intersectsBox(bz))) b.pos.z = np.z;
    b.mesh.position.copy(b.pos);
  }

  private shoot() {
    const r = this.run;
    if (r.fireCd > 0 || r.mag <= 0 || r.reloading > 0 || r.flashed > 0) return;
    r.mag--;
    r.fireCd = 0.1;
    const moving = this.keys.has("w") || this.keys.has("a") || this.keys.has("s") || this.keys.has("d");
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
    for (const b of this.bots) if (b.alive) b.mesh.traverse(o => { if ((o as THREE.Mesh).isMesh) botMeshes.push(o); });
    const allTargets = [...this.wallMeshes, ...botMeshes];
    const hits = ray.intersectObjects(allTargets, true);
    let hitPoint = origin.clone().add(dir.clone().multiplyScalar(80));
    if (hits.length > 0) {
      const h = hits[0];
      hitPoint = h.point;
      // find bot owning this mesh
      let obj: THREE.Object3D | null = h.object;
      while (obj && obj.parent && !this.bots.some(b => b.mesh === obj)) obj = obj.parent;
      const bot = this.bots.find(b => b.mesh === obj);
      if (bot && bot.alive) {
        const headHit = h.point.y > bot.pos.y + 1.5;
        const dmg = headHit ? 120 : 35;
        this.damageBot(bot, dmg);
      }
    }

    // tracer
    const geo = new THREE.BufferGeometry().setFromPoints([
      origin.clone().add(dir.clone().multiplyScalar(0.5)).add(new THREE.Vector3(0, -0.1, 0)),
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
      b.armor -= a; b.hp -= dmg - a;
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
          const spawns = [new THREE.Vector3(28,0,28),new THREE.Vector3(-28,0,28),new THREE.Vector3(0,0,32),new THREE.Vector3(32,0,-20),new THREE.Vector3(-32,0,20)];
          const sp = spawns[Math.floor(Math.random()*spawns.length)];
          this.bots.push(this.createBot(sp.x, sp.z));
        }, 1500);
      }
    }
  }

  private damagePlayer(dmg: number) {
    if (this.run.armor > 0) {
      const a = Math.min(this.run.armor, dmg * 0.5);
      this.run.armor -= a; this.run.hp -= dmg - a;
    } else this.run.hp -= dmg;
    if (this.run.hp <= 0) {
      this.run.deaths++;
      // respawn unless lethal threshold reached
      if (this.run.deaths >= 5) { this.endMatch(false); return; }
      this.run.hp = 100; this.run.armor = 50;
      this.run.mag = 25; this.run.ammo = 90;
      this.playerPos.set(0, 1.7, 0);
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
    let mx = 0, mz = 0;
    if (this.keys.has("w")) { mx -= forward.x; mz -= forward.z; }
    if (this.keys.has("s")) { mx += forward.x; mz += forward.z; }
    if (this.keys.has("a")) { mx -= right.x; mz -= right.z; }
    if (this.keys.has("d")) { mx += right.x; mz += right.z; }
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx /= len; mz /= len; }
    this.tryMove(mx * speed * dt, mz * speed * dt);
    this.camera.position.copy(this.playerPos);

    // reload + fire
    if (r.reloading > 0) {
      r.reloading -= dt;
      if (r.reloading <= 0) {
        const need = 25 - r.mag;
        const take = Math.min(need, r.ammo);
        r.mag += take; r.ammo -= take;
      }
    }
    r.fireCd = Math.max(0, r.fireCd - dt);
    if (this.mouseDown && this.pointerLocked) this.shoot();
    r.spread = Math.max(0, r.spread - dt * 0.5);
    if (r.flashed > 0) r.flashed -= dt;

    // abilities cd
    for (const k of ["q","e","x"] as AbilityKey[]) {
      const ab = r.abilities[k];
      if (ab.charges < ab.max) {
        ab.cd -= dt;
        if (ab.cd <= 0) { ab.charges++; ab.cd = ab.cooldown; }
      }
    }

    // tracers
    for (const t of this.tracers) {
      t.life -= dt;
      (t.line.material as THREE.LineBasicMaterial).opacity = Math.max(0, t.life / 0.08);
      (t.line.material as THREE.LineBasicMaterial).transparent = true;
    }
    this.tracers = this.tracers.filter(t => {
      if (t.life <= 0) { this.scene.remove(t.line); t.line.geometry.dispose(); return false; }
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
    this.flashMeshes = this.flashMeshes.filter(f => {
      if (f.life <= 0) { this.scene.remove(f.mesh); return false; }
      return true;
    });

    // smokes
    for (const s of this.smokes) s.life -= dt;
    this.smokes = this.smokes.filter(s => {
      if (s.life <= 0) { this.scene.remove(s.mesh); return false; }
      const op = Math.min(0.85, s.life / 2);
      (s.mesh.material as THREE.MeshStandardMaterial).opacity = op;
      return true;
    });

    // bots — frozen during round buy phase
    if (this.paused) return;
    for (const b of this.bots) {
      if (!b.alive) continue;

      if (b.flashed > 0) { b.flashed -= dt; continue; }
      const toPlayer = this.playerPos.clone().sub(b.pos);
      toPlayer.y = 0;
      const dist = toPlayer.length();
      const sees = dist < 50 && this.hasLOS(b.pos.clone().setY(1.5), this.playerPos.clone().setY(1.5));
      // face player when sees
      if (sees) {
        const a = Math.atan2(toPlayer.x, toPlayer.z);
        b.mesh.rotation.y = a;
        // strafe
        const strafeDir = (Math.sin(performance.now() / 1000 + b.pos.x) > 0 ? 1 : -1);
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
            const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 1 }));
            this.scene.add(line);
            this.tracers.push({ line, life: 0.08 });
          } else {
            // visible miss tracer
            const off = new THREE.Vector3((Math.random()-0.5)*4, (Math.random()-0.5)*2, (Math.random()-0.5)*4);
            const geo = new THREE.BufferGeometry().setFromPoints([b.pos.clone().setY(1.4), this.playerPos.clone().add(off)]);
            const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xff4d6d, transparent: true, opacity: 0.6 }));
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
        if (!seen.has(id)) { this.scene.remove(g); this.remoteMeshes.delete(id); }
      }
      r.onlinePlayers = this.mp.remotes.size + 1;
    }

    this.cb.onState({ ...r, abilities: { ...r.abilities } });
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

  getRun() { return this.run; }

  // ===== Round-system helpers (used by FPSGame HUD) =====
  setPaused(v: boolean) { this.paused = v; }
  getMapHalfSize() { return 40; }
  getPlayerSnapshot() {
    return { x: this.playerPos.x, z: this.playerPos.z, yaw: this.yaw };
  }
  getBotSnapshots() {
    return this.bots.map(b => ({ x: b.pos.x, z: b.pos.z, alive: b.alive }));
  }
  /** Reset per-round player state without disposing the engine. */
  resetForRound() {
    const r = this.run;
    r.hp = 100; r.armor = 50; r.mag = 25; r.ammo = 90;
    r.reloading = 0; r.fireCd = 0; r.spread = 0; r.flashed = 0;
    r.kills = 0; r.deaths = 0;
    r.message = ""; r.msgTimer = 0;
    // respawn any dead bots so the next round has opponents
    for (const b of this.bots) {
      if (!b.alive) {
        b.alive = true;
        b.hp = 100; b.armor = 30;
        b.pos.set((Math.random() - 0.5) * 60, 1.7, (Math.random() - 0.5) * 60);
        b.mesh.position.copy(b.pos);
        b.mesh.visible = true;
      }
    }
  }


  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.mp?.stop();
    this.mp = null;
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
