import * as THREE from "three";
import type { Agent } from "@/game/data/agents";

/**
 * Build a procedural humanoid for an agent. Each silhouette archetype produces
 * a visibly different model — different mass, headgear, capes, packs — so
 * agents are readable at a glance even with the same hitbox.
 *
 * HITBOX NOTE: visual proportions vary, but the engine uses a standardized
 * capsule for collision and damage. See `fps-engine.ts#HITBOX_RADIUS`.
 */
export function buildAgentModel(agent: Agent): THREE.Group {
  const g = new THREE.Group();
  const m = agent.model;

  const matBody = new THREE.MeshStandardMaterial({
    color: m.body,
    roughness: 0.52,
    metalness: 0.28,
    envMapIntensity: 0.8,
  });
  const matArmor = new THREE.MeshStandardMaterial({
    color: m.armor,
    roughness: 0.34,
    metalness: 0.78,
    envMapIntensity: 1,
  });
  const matSkin = new THREE.MeshStandardMaterial({
    color: m.head,
    roughness: 0.75,
    metalness: 0.05,
  });
  const matAccent = new THREE.MeshStandardMaterial({
    color: m.visor,
    roughness: 0.25,
    metalness: 0.3,
    emissive: m.visor,
    emissiveIntensity: 1.2,
    envMapIntensity: 1.1,
  });
  const matCloth = new THREE.MeshStandardMaterial({
    color: m.body,
    roughness: 0.9,
    metalness: 0.05,
  });

  const mats = {
    body: matBody,
    armor: matArmor,
    skin: matSkin,
    accent: matAccent,
    cloth: matCloth,
  };

  switch (agent.silhouette) {
    case "heavy":
      buildHeavy(g, mats);
      break;
    case "stealth":
      buildStealth(g, mats);
      break;
    case "scout":
      buildScout(g, mats);
      break;
    case "mage":
      buildMage(g, mats);
      break;
    case "support":
      buildSupport(g, mats);
      break;
    case "sniper":
      buildSniper(g, mats);
      break;
    case "ninja":
      buildNinja(g, mats);
      break;
    case "speedster":
      buildSpeedster(g, mats);
      break;
    case "soldier":
    default:
      buildSoldier(g, mats);
      break;
  }

  g.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });

  return g;
}

type Mats = {
  body: THREE.Material;
  armor: THREE.Material;
  skin: THREE.Material;
  accent: THREE.Material;
  cloth: THREE.Material;
};

// --- shared parts ---
function legs(g: THREE.Group, mat: THREE.Material, w = 0.7, h = 0.9, d = 0.45) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = h / 2;
  g.add(m);
}
function torso(g: THREE.Group, mat: THREE.Material, w: number, h: number, d: number, y: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = y;
  g.add(m);
  return m;
}
function arm(g: THREE.Group, mat: THREE.Material, sx: number, r = 0.12, len = 0.85, y = 1.3) {
  const a = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, len, 8), mat);
  a.position.set(sx, y, 0);
  g.add(a);
}
function head(g: THREE.Group, mat: THREE.Material, size = 0.42, y = 2.18) {
  const h = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), mat);
  h.position.y = y;
  g.add(h);
  return h;
}
function visor(g: THREE.Group, mat: THREE.Material, w = 0.44, h = 0.1, d = 0.44, y = 2.16) {
  const v = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  v.position.set(0, y, 0.005);
  g.add(v);
}

// --- archetype builders ---
function buildSoldier(g: THREE.Group, m: Mats) {
  legs(g, m.body);
  torso(g, m.body, 0.9, 0.85, 0.55, 1.4);
  // chest plate
  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.5, 0.08), m.armor);
  chest.position.set(0, 1.45, 0.3);
  g.add(chest);
  for (const sx of [-0.55, 0.55]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.22, 0.5), m.armor);
    pad.position.set(sx, 1.78, 0);
    g.add(pad);
    arm(g, m.body, sx);
  }
  head(g, m.skin);
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.28, 0.46), m.armor);
  helm.position.y = 2.32;
  g.add(helm);
  visor(g, m.accent);
}

function buildHeavy(g: THREE.Group, m: Mats) {
  // wider, taller, big shoulders, full face guard
  legs(g, m.armor, 0.9, 1.0, 0.55);
  torso(g, m.armor, 1.15, 0.95, 0.7, 1.55);
  for (const sx of [-0.7, 0.7]) {
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.4, 0.65), m.armor);
    pad.position.set(sx, 1.95, 0);
    g.add(pad);
    arm(g, m.body, sx, 0.18, 0.95, 1.4);
  }
  // backpack power-cell
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.2), m.armor);
  pack.position.set(0, 1.6, -0.45);
  g.add(pack);
  const cell = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.08), m.accent);
  cell.position.set(0, 1.65, -0.56);
  g.add(cell);
  // full face helmet
  const helm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.55, 0.55), m.armor);
  helm.position.y = 2.35;
  g.add(helm);
  const slit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.06, 0.46), m.accent);
  slit.position.set(0, 2.32, 0.01);
  g.add(slit);
}

function buildStealth(g: THREE.Group, m: Mats) {
  // slim, cloak, hood, mask
  legs(g, m.cloth, 0.55, 0.92, 0.4);
  torso(g, m.cloth, 0.7, 0.85, 0.42, 1.42);
  for (const sx of [-0.45, 0.45]) arm(g, m.cloth, sx, 0.09, 0.85);
  // cloak (back drape)
  const cloak = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.3, 0.05), m.cloth);
  cloak.position.set(0, 1.25, -0.28);
  g.add(cloak);
  head(g, m.skin, 0.36, 2.12);
  // hood
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 6), m.cloth);
  hood.position.set(0, 2.34, -0.04);
  g.add(hood);
  // mask slit
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.18, 0.36), m.armor);
  mask.position.set(0, 2.08, 0.02);
  g.add(mask);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.36), m.accent);
  eyes.position.set(0, 2.12, 0.025);
  g.add(eyes);
}

function buildScout(g: THREE.Group, m: Mats) {
  // lean, light, peaked cap, knee pads
  legs(g, m.body, 0.6, 0.95, 0.4);
  for (const sx of [-0.18, 0.18]) {
    const knee = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.08, 0.42), m.accent);
    knee.position.set(sx, 0.55, 0.02);
    g.add(knee);
  }
  torso(g, m.body, 0.78, 0.85, 0.46, 1.42);
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.1), m.armor);
  vest.position.set(0, 1.45, 0.26);
  g.add(vest);
  for (const sx of [-0.5, 0.5]) arm(g, m.body, sx, 0.1, 0.85);
  head(g, m.skin, 0.4, 2.15);
  // peaked cap
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.16, 0.46), m.armor);
  cap.position.y = 2.34;
  g.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.18), m.armor);
  brim.position.set(0, 2.28, 0.28);
  g.add(brim);
  // headset
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.02, 6, 16), m.accent);
  band.rotation.z = Math.PI / 2;
  band.position.set(0, 2.3, 0);
  g.add(band);
}

function buildMage(g: THREE.Group, m: Mats) {
  // long coat, tall hood, glowing emblem
  legs(g, m.cloth, 0.65, 0.95, 0.4);
  // long coat — extends below torso
  const coat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 1.0, 0.55), m.cloth);
  coat.position.set(0, 1.0, 0);
  g.add(coat);
  const emblem = new THREE.Mesh(new THREE.CircleGeometry(0.12, 16), m.accent);
  emblem.position.set(0, 1.3, 0.28);
  g.add(emblem);
  torso(g, m.cloth, 0.85, 0.55, 0.5, 1.7);
  for (const sx of [-0.5, 0.5]) arm(g, m.cloth, sx, 0.12, 0.95, 1.45);
  head(g, m.skin, 0.4, 2.22);
  // tall hood
  const hood1 = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.7, 6), m.cloth);
  hood1.position.set(0, 2.55, -0.05);
  g.add(hood1);
  visor(g, m.accent, 0.4, 0.08, 0.42, 2.18);
}

function buildSupport(g: THREE.Group, m: Mats) {
  // medic — visible backpack with cross, lighter armor
  legs(g, m.body);
  torso(g, m.body, 0.88, 0.85, 0.52, 1.4);
  for (const sx of [-0.52, 0.52]) arm(g, m.body, sx, 0.11, 0.85);
  // backpack
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.7, 0.28), m.armor);
  pack.position.set(0, 1.45, -0.45);
  g.add(pack);
  // medical cross
  const v1 = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.32, 0.04), m.accent);
  v1.position.set(0, 1.5, -0.6);
  g.add(v1);
  const v2 = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.08, 0.04), m.accent);
  v2.position.set(0, 1.5, -0.6);
  g.add(v2);
  head(g, m.skin);
  // light cap + headlamp
  const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.18, 0.44), m.armor);
  cap.position.y = 2.34;
  g.add(cap);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 10), m.accent);
  lamp.position.set(0, 2.34, 0.22);
  g.add(lamp);
}

function buildSniper(g: THREE.Group, m: Mats) {
  // tall, long coat, monocle scope, ghillie shoulders
  legs(g, m.body, 0.6, 1.05, 0.4);
  const coat = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.7, 0.5), m.cloth);
  coat.position.set(0, 1.25, 0);
  g.add(coat);
  torso(g, m.body, 0.78, 0.55, 0.46, 1.75);
  for (const sx of [-0.5, 0.5]) {
    arm(g, m.body, sx, 0.1, 0.95, 1.55);
    // ghillie tufts
    const tuft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.5), m.cloth);
    tuft.position.set(sx, 2.0, 0);
    g.add(tuft);
  }
  head(g, m.skin, 0.4, 2.32);
  // helmet skullcap
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    m.armor,
  );
  skull.position.y = 2.48;
  g.add(skull);
  // monocle scope on right eye
  const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.18, 12), m.armor);
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0.12, 2.3, 0.18);
  g.add(scope);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), m.accent);
  lens.rotation.y = 0;
  lens.position.set(0.12, 2.3, 0.27);
  g.add(lens);
}

function buildNinja(g: THREE.Group, m: Mats) {
  // agile, twin sashes, tied mask, ponytail spike
  legs(g, m.cloth, 0.55, 0.9, 0.38);
  torso(g, m.cloth, 0.72, 0.82, 0.42, 1.4);
  // crossed sashes
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.08, 0.04), m.accent);
  s1.position.set(0, 1.55, 0.22);
  s1.rotation.z = Math.PI / 6;
  g.add(s1);
  const s2 = s1.clone();
  s2.rotation.z = -Math.PI / 6;
  g.add(s2);
  for (const sx of [-0.46, 0.46]) {
    arm(g, m.cloth, sx, 0.09, 0.85);
    const wrap = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.18, 8), m.accent);
    wrap.position.set(sx, 0.95, 0);
    g.add(wrap);
  }
  head(g, m.skin, 0.38, 2.14);
  // mask covering lower face
  const mask = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.4), m.armor);
  mask.position.set(0, 2.04, 0.01);
  g.add(mask);
  // headband
  const band = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.42), m.accent);
  band.position.set(0, 2.22, 0.005);
  g.add(band);
  // ponytail
  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), m.body);
  tail.rotation.x = Math.PI;
  tail.position.set(0, 2.3, -0.28);
  g.add(tail);
}

function buildSpeedster(g: THREE.Group, m: Mats) {
  // sleek racing suit, aero visor, ankle fins
  legs(g, m.body, 0.55, 0.95, 0.38);
  for (const sx of [-0.18, 0.18]) {
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 0.32), m.accent);
    fin.position.set(sx, 0.18, 0);
    g.add(fin);
  }
  torso(g, m.body, 0.72, 0.85, 0.42, 1.42);
  // chest stripe
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.6, 0.05), m.accent);
  stripe.position.set(0, 1.45, 0.23);
  g.add(stripe);
  for (const sx of [-0.46, 0.46]) arm(g, m.body, sx, 0.09, 0.85);
  head(g, m.skin, 0.38, 2.14);
  // aero helmet (sphere top, swept back)
  const aero = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 16, 12, 0, Math.PI * 2, 0, Math.PI / 1.6),
    m.armor,
  );
  aero.position.y = 2.28;
  g.add(aero);
  // wraparound visor
  const v = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 16, 8, 0, Math.PI, Math.PI / 3, Math.PI / 3),
    m.accent,
  );
  v.rotation.y = Math.PI / 2;
  v.position.set(0, 2.16, 0);
  g.add(v);
}
