import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import type { Agent } from "@/game/data/agents";
import { buildAgentModel } from "@/game/agent-model";

/** Rotating 3D preview of an agent. Used on the Agent Select screen. */
export function AgentPreview3D({ agent, className }: { agent: Agent; className?: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [previewUnavailable, setPreviewUnavailable] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    setPreviewUnavailable(false);
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch (error) {
      console.warn("3D agent preview is unavailable", error);
      setPreviewUnavailable(true);
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const resize = () => {
      const w = host.clientWidth,
        h = host.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(0, 1.6, 4.6);
    camera.lookAt(0, 1.4, 0);

    // Cinematic lighting — key/rim/fill
    scene.add(new THREE.HemisphereLight(0x445566, 0x0a0e1a, 0.6));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(4, 6, 5);
    scene.add(key);
    const rim = new THREE.PointLight(new THREE.Color(agent.hue), 2.2, 12);
    rim.position.set(-2.5, 2.4, -1.5);
    scene.add(rim);
    const fill = new THREE.PointLight(0x6688aa, 0.6, 14);
    fill.position.set(2, 1.0, 3);
    scene.add(fill);

    // Floor disc
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(1.6, 48),
      new THREE.MeshStandardMaterial({ color: 0x0e1422, roughness: 0.9, metalness: 0.3 }),
    );
    disc.rotation.x = -Math.PI / 2;
    scene.add(disc);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(1.55, 1.7, 64),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(agent.hue),
        transparent: true,
        opacity: 0.8,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    scene.add(ring);

    const outerRing = new THREE.Mesh(
      new THREE.RingGeometry(2.05, 2.08, 96),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(agent.hue),
        transparent: true,
        opacity: 0.28,
      }),
    );
    outerRing.rotation.x = -Math.PI / 2;
    outerRing.position.y = 0.025;
    scene.add(outerRing);

    const shards = new THREE.Group();
    const shardMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(agent.hue),
      transparent: true,
      opacity: 0.55,
    });
    for (let i = 0; i < 18; i++) {
      const shard = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.18, 0.03), shardMat);
      const a = (i / 18) * Math.PI * 2;
      const r = 1.45 + (i % 3) * 0.18;
      shard.position.set(Math.cos(a) * r, 0.22 + (i % 4) * 0.18, Math.sin(a) * r);
      shard.userData.baseY = shard.position.y;
      shard.rotation.set(i * 0.4, a, i * 0.23);
      shards.add(shard);
    }
    scene.add(shards);

    const model = buildAgentModel(agent);
    scene.add(model);

    host.appendChild(renderer.domElement);
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    resize();
    window.addEventListener("resize", resize);

    let raf = 0;
    const clock = new THREE.Clock();
    const tick = () => {
      const t = clock.getElapsedTime();
      model.rotation.y = t * 0.5;
      // subtle idle bob
      model.position.y = Math.sin(t * 1.4) * 0.03;
      ring.rotation.z = -t * 0.3;
      outerRing.rotation.z = t * 0.18;
      shards.rotation.y = -t * 0.22;
      shards.children.forEach((child, i) => {
        child.position.y = child.userData.baseY + Math.sin(t * 1.8 + i) * 0.035;
      });
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      scene.traverse((object) => {
        const mesh = object as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        for (const material of materials) material.dispose();
      });
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentElement === host) host.removeChild(renderer.domElement);
    };
  }, [agent]);

  return (
    <div ref={hostRef} className={className}>
      {previewUnavailable && (
        <div className="absolute inset-0 grid place-items-center text-center text-sm text-muted-foreground">
          <div>
            <div className="font-black text-foreground uppercase">{agent.name}</div>
            <div>3D-превью недоступно, выбор персонажа продолжает работать</div>
          </div>
        </div>
      )}
    </div>
  );
}
