import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { MINERAL_PALETTE, createAmberMaterial, createBasaltMaterial, createMineralEnvironment, createSeamMaterial, fractureGeometry } from "./hero-materials";

export type SceneKind = "core" | "rig" | "reward" | "token";
export interface SceneController { setValue: (value: number) => void; dispose: () => void }

// A seeded stream keeps the authored composition stable across renders and devices.
function randomSource(seed: number) {
  return () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
}

export function createScene(host: HTMLElement, kind: SceneKind, initialValue: number): SceneController {
  const rand = randomSource(4289);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const scene = new THREE.Scene();
  const isCore = kind === "core";
  const mineralTime = { value: 0 };
  const isCrystal = isCore || kind === "reward";
  scene.background = null;
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 80);
  camera.position.set(0, 1, kind === "core" ? 11.4 : kind === "rig" ? 11.7 : 10);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  if (isCore) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  }
  renderer.transmissionResolutionScale = 0.65;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const mineralEnvironment = createMineralEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(mineralEnvironment.scene, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.85;
  mineralEnvironment.dispose();
  pmrem.dispose();

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), isCrystal ? 0.32 : 0.23, 0.38, 1.1);
  // Preserve transparent space around the illustration, including through the bloom pass.
  bloom.blendMaterial.fragmentShader = bloom.blendMaterial.fragmentShader.replace(
    "gl_FragColor = opacity * texel;",
    "gl_FragColor = vec4(opacity * texel.rgb, clamp(max(max(texel.r, texel.g), texel.b), 0.0, 1.0));",
  );
  bloom.blendMaterial.blending = THREE.CustomBlending;
  bloom.blendMaterial.blendSrc = THREE.OneFactor;
  bloom.blendMaterial.blendDst = THREE.OneFactor;
  bloom.blendMaterial.blendSrcAlpha = THREE.OneFactor;
  bloom.blendMaterial.blendDstAlpha = THREE.OneMinusSrcAlphaFactor;
  composer.addPass(bloom);
  const output = new OutputPass();
  composer.addPass(output);

  const ambient = new THREE.HemisphereLight(0xffedca, 0x442318, 0.55);
  scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffedcd, 2.6);
  key.position.set(-3, 6, 4);
  scene.add(key);
  if (isCore) {
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.1, far: 20 });
    key.shadow.bias = -0.0003;
    key.shadow.normalBias = 0.035;
  }
  const cyan = new THREE.PointLight(MINERAL_PALETTE.cyan, 16, 18, 2);
  cyan.position.set(3, 1, isCore ? -1 : 1);
  scene.add(cyan);
  const warm = new THREE.PointLight(0xffa728, isCrystal ? 35 : 12, 15, 2);
  warm.position.set(-2, -0.5, 2);
  scene.add(warm);
  const rim = new THREE.DirectionalLight(0xaff5f4, 2.3);
  rim.position.set(2, 4, -4);
  scene.add(rim);

  const gold = new THREE.MeshPhysicalMaterial({ color: MINERAL_PALETTE.amber, metalness: 0.38, roughness: 0.17, flatShading: true, clearcoat: 1, clearcoatRoughness: 0.1, emissive: 0xff8c16, emissiveIntensity: 0.06 });
  const goldLight = new THREE.MeshPhysicalMaterial({ color: MINERAL_PALETTE.ivory, metalness: 0.32, roughness: 0.16, flatShading: true, clearcoat: 1 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x151314, metalness: 0.25, roughness: 0.44, envMapIntensity: 0.35, flatShading: true });
  const rock = createBasaltMaterial();
  const steel = new THREE.MeshStandardMaterial({ color: 0x9d9290, metalness: 0.8, roughness: 0.24 });
  const emissiveGold = new THREE.MeshStandardMaterial({ color: 0xffdb83, emissive: 0xffac30, emissiveIntensity: 2.4, metalness: 0.2, roughness: 0.22 });
  const emissiveCyan = new THREE.MeshStandardMaterial({ color: 0x058eae, emissive: 0x00b8d2, emissiveIntensity: 2.0, roughness: 0.52 });
  const materials: THREE.Material[] = [gold, goldLight, dark, rock, steel, emissiveGold, emissiveCyan];
  const amber = createAmberMaterial();
  const seamMaterial = createSeamMaterial(mineralTime);
  materials.push(amber, seamMaterial);
  const world = new THREE.Group();
  scene.add(world);
  const object = new THREE.Group();
  world.add(object);
  const mineral = new THREE.Group();
  object.add(mineral);
  const parts: { mesh: THREE.Object3D; position: THREE.Vector3; direction: THREE.Vector3; scale: THREE.Vector3; phase: number }[] = [];
  const tiers: THREE.Group[] = [];
  let coin: THREE.Group | undefined;

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    if (isCore) { m.castShadow = material !== amber && material !== seamMaterial; m.receiveShadow = true; }
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function box(w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  }
  function ring(radius: number, thickness: number, material: THREE.Material, parent: THREE.Object3D) {
    return mesh(new THREE.TorusGeometry(radius, thickness, 8, 96), material, parent);
  }
  function addFragments(count: number, inner: number, outer: number, parent: THREE.Object3D, stone = false) {
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const radius = inner + rand() * (outer - inner);
      const position = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.81, (rand() - 0.5) * 2.4);
      const size = stone ? (isCore ? 0.12 + rand() * 0.25 : 0.13 + rand() * 0.18) : 0.025 + rand() * 0.12;
      const geometry = fractureGeometry(size, i + 472, stone && !isCore);
      const shardMaterial = stone && !isCore ? rock : i % 11 === 0 ? seamMaterial : i % 3 === 0 ? goldLight : gold;
      const shard = mesh(geometry, shardMaterial, parent);
      shard.position.copy(position);
      shard.scale.set(0.7 + rand(), 0.5 + rand(), 0.6 + rand());
      shard.rotation.set(rand() * 5, rand() * 5, rand() * 5);
      parts.push({ mesh: shard, position: position.clone(), direction: position.clone().normalize(), scale: shard.scale.clone(), phase: rand() * 6 });
    }
  }
  function addDust() {
    const count = isCore ? 1100 : kind === "reward" ? 680 : kind === "rig" ? 180 : 400;
    const dustRand = randomSource(599);
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const tilt = 0.54;
    for (let i = 0; i < count; i++) {
      const angle = dustRand() * Math.PI * 2;
      const radius = 2.35 + (dustRand() - 0.5) * (i % 5 === 0 ? 2.3 : 0.52);
      const x = Math.cos(angle) * radius * 1.35;
      const y = Math.sin(angle) * radius * 0.5;
      positions[i * 3] = x * Math.cos(tilt) - y * Math.sin(tilt);
      positions[i * 3 + 1] = x * Math.sin(tilt) + y * Math.cos(tilt);
      positions[i * 3 + 2] = Math.sin(angle) * 1.4 + (dustRand() - 0.5) * 0.45;
      const color = new THREE.Color(i % 19 === 0 ? MINERAL_PALETTE.cyan : i % 7 === 0 ? MINERAL_PALETTE.ivory : MINERAL_PALETTE.amber);
      color.multiplyScalar(1.2 + dustRand() * 0.8).toArray(colors, i * 3);
      sizes[i] = 0.45 + dustRand() * 1.25;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    const material = new THREE.ShaderMaterial({
      uniforms: { uTime: mineralTime, uPixelRatio: { value: renderer.getPixelRatio() } },
      vertexColors: true,
      transparent: true, depthWrite: false,
      vertexShader: /* glsl */`
        uniform float uTime;
        uniform float uPixelRatio;
        attribute float aSize;
        varying vec3 vColor;
        varying float vBrightness;
        void main() {
          vec3 p = position;
          float phase = position.x * 7.0 + position.z * 11.0;
          p.y += sin(uTime * 0.2 + phase) * 0.04;
          vec4 view = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * view;
          gl_PointSize = clamp(aSize * 18.0 / -view.z, 0.7, 3.2) * uPixelRatio;
          vBrightness = 0.4 + 0.5 * pow(0.5 + 0.5 * sin(uTime * 0.5 + phase), 3.0);
          vColor = color;
        }
      `,
      fragmentShader: /* glsl */`
        varying vec3 vColor;
        varying float vBrightness;
        void main() {
          float distanceToCenter = length(gl_PointCoord - 0.5);
          float alpha = (1.0 - smoothstep(0.12, 0.5, distanceToCenter)) * vBrightness;
          gl_FragColor = vec4(vColor, alpha);
        }
      `,
    });
    materials.push(material);
    world.add(new THREE.Points(geometry, material));
  }

  if (kind === "core" || kind === "reward") {
    const geometry = fractureGeometry(isCore ? 1.58 : 1.48, 81, false);
    geometry.scale(0.9, 1.12, 0.87);
    mesh(geometry, amber, mineral);
    if (isCore) {
      // Mineral inclusions behind the transmissive shell give the amber optical depth.
      const inclusion = new THREE.MeshStandardMaterial({ color: 0xf59618, emissive: 0xff850b, emissiveIntensity: 0.1, metalness: 0.12, roughness: 0.16, flatShading: true });
      materials.push(inclusion);
      const interior = mesh(fractureGeometry(1.13, 32, true), inclusion, mineral);
      interior.scale.set(0.8, 1.1, 0.72);
      interior.rotation.set(0.2, 0.5, 0.4);
      const inclusionRand = randomSource(911);
      for (let i = 0; i < 12; i++) {
        const fleck = mesh(fractureGeometry(0.08 + inclusionRand() * 0.12, i, false), i % 3 === 0 ? goldLight : inclusion, mineral);
        fleck.position.set((inclusionRand() - 0.5) * 1.4, (inclusionRand() - 0.5) * 1.8, (inclusionRand() - 0.5) * 1.1);
        fleck.scale.set(1, 0.22, 0.7);
        fleck.rotation.set(inclusionRand() * 4, inclusionRand() * 4, inclusionRand() * 4);
      }
    } else {
      const inner = mesh(new THREE.IcosahedronGeometry(1.0, 1), goldLight, mineral);
      inner.rotation.set(0.2, 0.5, 0.4);
    }
    // Render after transmission: depth hides the inner shell, leaving only a crisp cyan silhouette.
    const edgeMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x00c9df).multiplyScalar(1.5), side: THREE.BackSide, transparent: true, depthWrite: false });
    materials.push(edgeMaterial);
    const edge = mesh(geometry, edgeMaterial, mineral);
    edge.scale.setScalar(1.019);
    edge.castShadow = false;
    edge.renderOrder = 10;
    object.rotation.set(0.08, -0.3, -0.17);
    addFragments(kind === "core" ? 31 : 15, kind === "core" ? 1.65 : 1.9, kind === "core" ? 2.8 : 2.6, object, kind === "core");
    addFragments(40, 1.9, 3.4, world);
    const orbitMaterial = new THREE.MeshBasicMaterial({ color: MINERAL_PALETTE.cyan, transparent: true, opacity: 0.25 });
    materials.push(orbitMaterial);
    const orbit = ring(2.6, 0.003, orbitMaterial, world);
    orbit.rotation.set(1.02, 0.3, 0.54);
    addDust();
  }

  if (kind === "rig") {
    object.rotation.set(0.18, -0.58, 0);
    object.position.y = -0.32;
    box(2.6, 0.16, 2.2, dark, object, 0, -1.28, 0);
    box(2.44, 0.045, 2.04, steel, object, 0, -1.18, 0);
    box(1.96, 1.98, 1.58, dark, object, 0, -0.1, 0);
    box(2.05, 0.1, 1.7, steel, object, 0, 0.92, 0);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 4; i++) {
        const bolt = mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.035, 8), steel, object, side * 0.85, -0.92 + i * 0.54, 0.807);
        bolt.rotation.x = Math.PI / 2;
      }
    }
    for (let i = 0; i < 6; i++) {
      box(1.58, 0.11, 0.05, emissiveGold, object, 0, -0.81 + i * 0.28, 0.82);
      for (let fin = 0; fin < 25; fin++) box(0.013, 0.14, 0.09, steel, object, -0.73 + fin * 0.06, -0.81 + i * 0.28, 0.86);
    }
    for (let i = 0; i < 17; i++) box(0.055, 0.23, 1.4, steel, object, -0.85 + i * 0.106, 1.05, 0);
    box(0.04, 0.25, 0.85, emissiveGold, object, 0.992, 0.32, 0);
    box(0.045, 0.03, 0.48, emissiveCyan, object, 1.001, -0.02, 0.05);
    for (let i = 0; i < 5; i++) {
      const group = new THREE.Group();
      group.position.y = 1.08 + i * 0.29;
      box(1.86, 0.24, 1.55, dark, group);
      box(1.64, 0.13, 0.04, emissiveGold, group, 0, 0, 0.8);
      for (let fin = 0; fin < 15; fin++) box(0.15, 0.22, 0.035, i > 1 ? emissiveCyan : steel, group, 0.99, 0, -0.65 + fin * 0.092);
      tiers.push(group);
      object.add(group);
    }
    const floor = new THREE.GridHelper(6.2, 16, 0x3c2d26, 0x231b17);
    floor.position.y = -1.45;
    world.add(floor);
    const pad = ring(2.13, 0.012, emissiveGold, world);
    pad.rotation.x = Math.PI / 2;
    pad.position.y = -1.42;
    addFragments(12, 2.1, 3.1, world, true);
    addDust();
  }

  if (kind === "token") {
    coin = new THREE.Group();
    object.add(coin);
    const coinBody = mesh(new THREE.CylinderGeometry(1.52, 1.52, 0.21, 96), gold, coin);
    coinBody.rotation.x = Math.PI / 2;
    const face = mesh(new THREE.CylinderGeometry(1.37, 1.37, 0.025, 96), dark, coin, 0, 0, 0.12);
    face.rotation.x = Math.PI / 2;
    const rimA = ring(1.42, 0.03, goldLight, coin);
    rimA.position.z = 0.155;
    const innerRing = ring(1.21, 0.008, gold, coin);
    innerRing.position.z = 0.14;
    for (let i = 0; i < 72; i++) {
      const a = i / 72 * Math.PI * 2;
      const ridge = box(0.022, 0.072, 0.225, goldLight, coin, Math.sin(a) * 1.49, Math.cos(a) * 1.49, 0);
      ridge.rotation.z = -a;
    }
    const bolt = new THREE.Shape();
    bolt.moveTo(0.2, 0.9); bolt.lineTo(-0.62, -0.07); bolt.lineTo(-0.1, -0.07); bolt.lineTo(-0.25, -0.83); bolt.lineTo(0.63, 0.22); bolt.lineTo(0.11, 0.22); bolt.closePath();
    mesh(new THREE.ExtrudeGeometry(bolt, { depth: 0.075, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.018, bevelThickness: 0.01 }), goldLight, coin, 0, 0, 0.17);
    coin.rotation.set(-0.1, -0.34, -0.22);
    addFragments(48, 1.95, 3.2, object);
    const orbitMaterial = new THREE.MeshBasicMaterial({ color: MINERAL_PALETTE.cyan, transparent: true, opacity: 0.35 });
    materials.push(orbitMaterial);
    const orbit = ring(2.58, 0.006, orbitMaterial, world);
    orbit.rotation.set(0.5, 0.9, -0.2);
    cyan.intensity = 14;
    addDust();
  }

  let value = initialValue;
  let displayed = initialValue;
  let frame = 0;
  let elapsed = 0;
  let entranceFinished = kind !== "core" || reduced.matches;
  let previous = 0;
  let visible = false;
  let disposed = false;
  let pointerX = 0;
  let pointerY = 0;
  let rotationX = 0;
  let rotationY = 0;
  const baseRotation = object.rotation.clone();

  function draw(time: number) {
    if (disposed) return;
    const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 0;
    previous = time;
    if (!reduced.matches) elapsed += dt;
    mineralTime.value = elapsed;
    const ease = reduced.matches ? 1 : 1 - Math.exp(-dt * 5.5);
    displayed += (value - displayed) * ease;
    rotationX += (pointerY * 0.1 - rotationX) * (reduced.matches ? 1 : 0.06);
    rotationY += (pointerX * 0.22 - rotationY) * (reduced.matches ? 1 : 0.06);
    object.rotation.x = baseRotation.x + (reduced.matches ? 0 : rotationX);
    object.rotation.y = baseRotation.y + (reduced.matches ? 0 : rotationY + Math.sin(elapsed * 0.22) * 0.1) + (kind === "reward" ? displayed * 0.32 : 0);
    if (kind !== "rig") object.position.y = Math.sin(elapsed * 0.75) * 0.065;

    // Play once when the hero first renders. Scroll expansion remains an independent layer.
    if (reduced.matches || elapsed >= 0.9) entranceFinished = true;
    if (kind === "core") {
      const progress = entranceFinished ? 1 : THREE.MathUtils.clamp(elapsed / 0.36, 0, 1);
      const reveal = 1 - Math.pow(1 - progress, 3);
      mineral.visible = progress > 0;
      mineral.scale.setScalar(0.28 + reveal * 0.72);
      mineral.rotation.y = (1 - reveal) * -0.35;
    }

    parts.forEach((part, i) => {
      const offset = kind === "core" ? displayed * (0.68 + (i % 4) * 0.19) : 0;
      const gather = kind === "token" ? 1 - displayed * 0.89 : 1;
      part.mesh.position.copy(part.position).multiplyScalar(gather).addScaledVector(part.direction, offset);
      if (kind === "core") {
        // Different short delays make the stones and shards burst out in overlapping waves.
        const delay = 0.07 + (i % 7) * 0.022 + part.phase * 0.023;
        const progress = entranceFinished ? 1 : THREE.MathUtils.clamp((elapsed - delay) / 0.46, 0, 1);
        const back = progress - 1;
        const burst = 1 + 2.35 * back * back * back + 1.35 * back * back;
        part.mesh.visible = progress > 0;
        part.mesh.position.multiplyScalar(0.16 + burst * 0.84);
        part.mesh.scale.copy(part.scale).multiplyScalar(Math.max(0.001, burst));
      }
      if (!reduced.matches) {
        part.mesh.position.y += Math.sin(elapsed * 0.5 + part.phase) * 0.06 * gather;
        part.mesh.rotation.y += dt * 0.09;
      }
      if (kind === "token") part.mesh.scale.setScalar(Math.max(0.01, 1 - displayed * 0.97));
    });
    tiers.forEach((group, index) => {
      const amount = THREE.MathUtils.clamp(displayed - index, 0, 1);
      group.visible = amount > 0.005;
      group.scale.y = Math.max(0.001, amount);
      group.position.y = 1.11 + index * 0.29 - (1 - amount) * 0.25;
    });
    if (kind === "rig") object.position.y = -0.32 - displayed * 0.075;
    if (coin) coin.rotation.y = -0.34 + displayed * 0.35;
    composer.render();
    frame = 0;
    if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(draw);
  }
  function requestDraw() {
    if (!frame && !disposed && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height) return;
    camera.aspect = width / height;
    // Keep the whole composition within narrow mobile canvases.
    camera.position.z = (kind === "core" ? 11.4 : kind === "rig" ? 11.7 : 10) * Math.max(1, 0.9 / camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    requestDraw();
  }
  function pointerMove(event: PointerEvent) {
    if (event.pointerType === "touch" || reduced.matches) return;
    const rect = host.getBoundingClientRect();
    pointerX = (event.clientX - rect.left) / rect.width * 2 - 1;
    pointerY = (event.clientY - rect.top) / rect.height * 2 - 1;
  }
  function pointerLeave() { pointerX = 0; pointerY = 0; }
  function visibilityChange() { previous = 0; requestDraw(); }
  function motionChange() { previous = 0; requestDraw(); }
  function contextLost(event: Event) {
    event.preventDefault();
    host.classList.remove("is-ready");
    host.classList.add("is-fallback");
    cancelAnimationFrame(frame);
    frame = 0;
    visible = false;
  }
  const parent = host.closest("section") ?? host;
  parent.addEventListener("pointermove", pointerMove as EventListener);
  parent.addEventListener("pointerleave", pointerLeave);
  const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; previous = 0; requestDraw(); }, { rootMargin: "100px" });
  observer.observe(host);
  const sizeObserver = new ResizeObserver(resize);
  sizeObserver.observe(host);
  document.addEventListener("visibilitychange", visibilityChange);
  reduced.addEventListener("change", motionChange);
  renderer.domElement.addEventListener("webglcontextlost", contextLost);
  resize();

  return {
    setValue(next) { value = next; requestDraw(); },
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      sizeObserver.disconnect();
      parent.removeEventListener("pointermove", pointerMove as EventListener);
      parent.removeEventListener("pointerleave", pointerLeave);
      document.removeEventListener("visibilitychange", visibilityChange);
      reduced.removeEventListener("change", motionChange);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      const geometries = new Set<THREE.BufferGeometry>();
      scene.traverse((item) => {
        if (item instanceof THREE.Mesh || item instanceof THREE.Line || item instanceof THREE.Points) {
          geometries.add(item.geometry);
          const mats = Array.isArray(item.material) ? item.material : [item.material];
          mats.forEach(m => { if (!materials.includes(m)) materials.push(m); });
        }
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      key.shadow.dispose();
      envTarget.dispose();
      bloom.dispose();
      output.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
