import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { SILICON_PALETTE, createComputeEnvironment, createSiliconMaterial, plateGeometry, shardGeometry } from "./hero-materials";

/**
 * The four landing illustrations (Hyperscaler design handoff 2026-09-09):
 *   core    the hero processor; its board, memory and cooling layers separate as the page scrolls
 *   rig     a server node that brings compute sleds online as the "how it works" chapter scrolls
 *   reward  four processor cards, one per Stock Token, the current one brought forward
 *   token   shards that assemble into a stock-token module on demand
 * Every scene shares one frame loop, one bloom pass and an orbiting "atmosphere" of shards and dust.
 */
export type SceneKind = "core" | "rig" | "reward" | "token";
export interface SceneController { setValue: (value: number) => void; dispose: () => void }

const TAU = Math.PI * 2;
const AXIS_Y = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const smooth = (value: number) => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
/** Deterministic pseudo-random in [0, 1): the composition is authored, not rolled per visit. */
const hash = (index: number, salt: number) => THREE.MathUtils.euclideanModulo(Math.sin((index + 1) * salt) * 43758.5453, 1);

export function createScene(host: HTMLElement, kind: SceneKind, initialValue: number): SceneController {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 80);
  const distance = kind === "core" ? 11.4 : kind === "rig" ? 11.7 : 10.5;
  camera.position.set(0, 1, distance);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, premultipliedAlpha: false, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.6));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.domElement.setAttribute("aria-hidden", "true");
  host.appendChild(renderer.domElement);

  const environment = createComputeEnvironment();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTarget = pmrem.fromScene(environment.scene, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.85;
  environment.dispose();
  pmrem.dispose();

  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: Math.min(4, renderer.capabilities.maxSamples) });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.21, 0.3, 1.15);
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

  scene.add(new THREE.HemisphereLight(0xf4fff7, 0x18211c, 1.1));
  const key = new THREE.DirectionalLight(0xf6fff8, 3.1);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const signalLight = new THREE.PointLight(SILICON_PALETTE.signal, 18, 18, 2);
  signalLight.position.set(3, 1, -1);
  scene.add(signalLight);
  const powerLight = new THREE.PointLight(SILICON_PALETTE.power, 13, 15, 2);
  powerLight.position.set(-2, -0.5, 3);
  scene.add(powerLight);
  const rim = new THREE.DirectionalLight(0xd3f7dc, 2.2);
  rim.position.set(2, 4, -4);
  scene.add(rim);

  const subject = buildSubject(kind);
  scene.add(subject.root);
  const atmosphere = buildAtmosphere(kind);
  scene.add(atmosphere.root);

  const baseRotation = subject.root.rotation.clone();
  let value = initialValue;
  let displayed = initialValue;
  let frame = 0;
  let elapsed = 0;
  let previous = 0;
  let visible = false;
  let disposed = false;
  let lost = false;
  let pointerX = 0;
  let pointerY = 0;
  let rotationX = 0;
  let rotationY = 0;
  let entranceFinished = kind !== "core" || reduced.matches;

  function draw(time: number) {
    if (disposed || lost) return;
    const dt = previous ? Math.min((time - previous) / 1000, 0.05) : 0;
    previous = time;
    if (!reduced.matches) elapsed += dt;
    displayed += (value - displayed) * (reduced.matches ? 1 : 1 - Math.exp(-dt * 5.5));
    const ease = 1 - Math.exp(-dt * 6);
    rotationX += (pointerY * 0.1 - rotationX) * ease;
    rotationY += (pointerX * 0.18 - rotationY) * ease;
    subject.root.rotation.x = baseRotation.x + (reduced.matches ? 0 : rotationX);
    subject.root.rotation.y = baseRotation.y + (reduced.matches ? 0 : rotationY + Math.sin(elapsed * 0.22) * 0.055);
    if (kind !== "rig") subject.root.position.y = Math.sin(elapsed * 0.75) * 0.04;
    if (reduced.matches || elapsed >= 0.9) entranceFinished = true;
    const clock = reduced.matches ? 0 : elapsed;
    subject.update(displayed, clock, entranceFinished);
    atmosphere.update(displayed, clock, entranceFinished, reduced.matches ? 0 : rotationY / 0.18, reduced.matches ? 0 : rotationX / 0.1);
    composer.render();
    frame = 0;
    if (visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(draw);
  }
  function requestDraw() {
    if (!frame && !disposed && !lost && visible && !document.hidden) frame = requestAnimationFrame(draw);
  }
  function resize() {
    const width = host.clientWidth;
    const height = host.clientHeight;
    if (!width || !height || lost) return;
    camera.aspect = width / height;
    // Keep the whole composition within narrow mobile canvases.
    camera.position.z = distance * Math.max(1, 0.9 / camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    requestDraw();
    atmosphere.resize(width, renderer.getPixelRatio());
  }
  const parent = host.closest("section") ?? host;
  function pointerMove(event: PointerEvent) {
    if (reduced.matches || event.pointerType === "touch") return;
    const rect = parent.getBoundingClientRect();
    pointerX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerY = ((event.clientY - rect.top) / rect.height) * 2 - 1;
    requestDraw();
  }
  function pointerLeave() { pointerX = 0; pointerY = 0; requestDraw(); }
  function visibilityChange() { if (document.hidden) { cancelAnimationFrame(frame); frame = 0; } previous = 0; requestDraw(); }
  function motionChange() { if (reduced.matches) { cancelAnimationFrame(frame); frame = 0; entranceFinished = true; } previous = 0; requestDraw(); }
  function contextLost(event: Event) {
    event.preventDefault();
    lost = true;
    cancelAnimationFrame(frame);
    frame = 0;
    host.classList.remove("is-ready");
    host.classList.add("is-fallback");
  }
  parent.addEventListener("pointermove", pointerMove as EventListener, { passive: true });
  parent.addEventListener("pointerleave", pointerLeave);
  const observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    previous = 0;
    if (!visible) { cancelAnimationFrame(frame); frame = 0; }
    requestDraw();
  }, { rootMargin: "100px" });
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
      const materials = new Set<THREE.Material>();
      scene.traverse((item) => {
        if (item instanceof THREE.Mesh || item instanceof THREE.Line || item instanceof THREE.Points) {
          geometries.add(item.geometry);
          (Array.isArray(item.material) ? item.material : [item.material]).forEach(m => materials.add(m));
          if (item instanceof THREE.InstancedMesh) item.dispose();
        }
      });
      geometries.forEach(g => g.dispose());
      materials.forEach(m => m.dispose());
      subject.textures.forEach(t => t.dispose());
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

interface Subject {
  root: THREE.Group;
  textures: THREE.Texture[];
  update(value: number, time: number, entranceFinished: boolean): void;
}

function buildSubject(kind: SceneKind): Subject {
  const root = new THREE.Group();
  const board = new THREE.MeshStandardMaterial({ color: 0x202622, metalness: 0.64, roughness: 0.34 });
  const boardLight = new THREE.MeshStandardMaterial({ color: 0x29332d, metalness: 0.5, roughness: 0.4 });
  const slate = new THREE.MeshStandardMaterial({ color: 0x111613, metalness: 0.25, roughness: 0.44 });
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8c2bc, metalness: 0.94, roughness: 0.25 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xcbd3ce, metalness: 0.88, roughness: 0.23 });
  const glow = new THREE.MeshStandardMaterial({ color: SILICON_PALETTE.signal, emissive: SILICON_PALETTE.signal, emissiveIntensity: 1.5, metalness: 0.4, roughness: 0.25 });
  const power = new THREE.MeshStandardMaterial({ color: SILICON_PALETTE.power, emissive: SILICON_PALETTE.power, emissiveIntensity: 1.35, metalness: 0.5, roughness: 0.27 });
  const clock = { value: 0 };
  const silicon = createSiliconMaterial(clock);
  const trace = new THREE.LineBasicMaterial({ color: 0x3d7650, transparent: true, opacity: 0.55 });
  const brightTrace = new THREE.LineBasicMaterial({ color: SILICON_PALETTE.signal, transparent: true, opacity: 0.75 });
  const textures: THREE.Texture[] = [];

  const layers: { object: THREE.Group; start: THREE.Vector3; offset: THREE.Vector3; delay: number }[] = [];
  const fans: THREE.Group[] = [];
  const cards: { group: THREE.Group; ticks: THREE.Mesh[]; light: THREE.Mesh }[] = [];
  const sleds: THREE.Group[] = [];
  const shards: { object: THREE.Mesh; start: THREE.Vector3; target: THREE.Vector3 }[] = [];
  let hoses: THREE.Group | undefined;
  let tokenModule: THREE.Group | undefined;
  let lastTime = 0;
  const scratch = new THREE.Vector3();

  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    parent.add(m);
    return m;
  }
  function box(w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    return mesh(new THREE.BoxGeometry(w, h, d), material, parent, x, y, z);
  }
  function plate(w: number, h: number, d: number, material: THREE.Material, parent: THREE.Object3D, x = 0, y = 0, z = 0) {
    return mesh(plateGeometry(w, h, d), material, parent, x, y, z);
  }
  function traceLine(points: [number, number, number][], parent: THREE.Object3D, bright = false) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => new THREE.Vector3(...p))), bright ? brightTrace : trace);
    parent.add(line);
  }
  /** A printed label (ticker plus a small caption) as a canvas texture on a transparent plane. */
  function label(text: string, caption: string, w: number, h: number, parent: THREE.Object3D, y: number, z: number) {
    const canvas = document.createElement("canvas");
    canvas.width = 1024;
    canvas.height = 384;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 1024, 384);
    ctx.textAlign = "center";
    ctx.fillStyle = "#f5f7f5";
    ctx.font = "600 160px Arial, sans-serif";
    ctx.fillText(text, 512, 205);
    ctx.fillStyle = "#83e69a";
    ctx.font = "30px monospace";
    ctx.fillText(caption, 512, 302);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }), parent, 0, y, z);
  }
  function screws(parent: THREE.Object3D, w: number, h: number, z: number) {
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
      const screw = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.026, 12), steel, parent, sx * (w / 2 - 0.13), sy * (h / 2 - 0.13), z);
      screw.rotation.x = Math.PI / 2;
      box(0.05, 0.009, 0.004, slate, parent, screw.position.x, screw.position.y, z + 0.016);
    }
  }
  function layer(parent: THREE.Object3D, x: number, y: number, z: number, offset: [number, number, number], delay: number) {
    const group = new THREE.Group();
    group.position.set(x, y, z);
    parent.add(group);
    layers.push({ object: group, start: group.position.clone(), offset: new THREE.Vector3(...offset), delay });
    return group;
  }
  /** Edge connector pins around a board: one instanced mesh per board. */
  function pins(parent: THREE.Object3D, w: number, h: number, z: number) {
    const instanced = new THREE.InstancedMesh(new THREE.BoxGeometry(0.055, 0.16, 0.025), alloy, 96);
    const dummy = new THREE.Object3D();
    for (let side = 0; side < 4; side++) for (let i = 0; i < 24; i++) {
      const t = (i / 23 - 0.5) * 0.85;
      dummy.position.set(side < 2 ? t * w : side === 2 ? -w / 2 : w / 2, side < 2 ? (side === 0 ? -h / 2 : h / 2) : t * h, z);
      dummy.rotation.z = side < 2 ? 0 : Math.PI / 2;
      dummy.updateMatrix();
      instanced.setMatrixAt(side * 24 + i, dummy.matrix);
    }
    parent.add(instanced);
  }

  if (kind === "core") {
    root.rotation.set(-0.19, -0.46, -0.3);
    const baseBoard = layer(root, 0, 0, 0, [0, -0.28, -0.7], 0);
    plate(3.45, 3.45, 0.1, boardLight, baseBoard);
    plate(3.24, 3.24, 0.045, board, baseBoard, 0, 0, 0.08);
    pins(baseBoard, 3.38, 3.38, 0.035);
    screws(baseBoard, 3.45, 3.45, 0.12);
    for (let i = 0; i < 12; i++) {
      const t = (i - 5.5) * 0.12;
      traceLine([[t, -0.75, 0.13], [t, -1.1, 0.13], [t - 0.18, -1.28, 0.13], [t - 0.18, -1.56, 0.13]], baseBoard, i % 4 === 0);
      traceLine([[0.78, t, 0.13], [1.08, t, 0.13], [1.32, t + 0.18, 0.13], [1.56, t + 0.18, 0.13]], baseBoard, i % 4 === 0);
    }
    const dieLayer = layer(root, 0, 0, 0.23, [0, 0.08, 0.55], 0.04);
    plate(1.74, 1.74, 0.1, steel, dieLayer);
    plate(1.59, 1.59, 0.055, glow, dieLayer, 0, 0, 0.07);
    plate(1.5, 1.5, 0.09, silicon, dieLayer, 0, 0, 0.12);
    const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(0.205, 0.205, 0.018), silicon, 36);
    const dummy = new THREE.Object3D();
    for (let i = 0; i < 36; i++) {
      dummy.position.set(((i % 6) - 2.5) * 0.231, (Math.floor(i / 6) - 2.5) * 0.231, 0.18);
      dummy.updateMatrix();
      tiles.setMatrixAt(i, dummy.matrix);
    }
    dieLayer.add(tiles);
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1;
      const slot = i % 4;
      const memory = layer(root, 1.21 * side, (slot - 1.5) * 0.64, 0.19, [0.22 * side, (slot - 1.5) * 0.06, 0.18 + 0.055 * slot], 0.08 + 0.018 * i);
      plate(0.46, 0.48, 0.08, steel, memory);
      plate(0.39, 0.4, 0.04, slate, memory, 0, 0, 0.06);
      box(0.28, 0.012, 0.008, glow, memory, 0, -0.125, 0.088);
      for (let j = 0; j < 4; j++) box(0.22, 0.007, 0.008, steel, memory, 0, -0.04 + 0.048 * j, 0.088);
    }
    const heatsink = layer(root, 0, 0.17, -0.22, [0.12, 0.95, -1.05], 0.14);
    plate(3.02, 2.92, 0.15, steel, heatsink);
    for (let i = 0; i < 19; i++) box(0.095, 2.75, 0.14, board, heatsink, (i - 9) * 0.143, 0, -0.13);
    const frame = layer(root, 0, 0, 0.12, [0, 0.15, 0.86], 0.17);
    for (const side of [-1, 1]) {
      box(3.06, 0.055, 0.07, steel, frame, 0, 1.5 * side, 0);
      box(0.055, 3.06, 0.07, steel, frame, 1.5 * side, 0, 0);
      box(0.018, 0.62, 0.02, glow, frame, 1.5 * side, 0, 0.055);
    }
  }

  if (kind === "rig") {
    root.rotation.set(0.18, -0.46, 0);
    plate(3.2, 3.9, 1.65, board, root);
    plate(2.88, 3.63, 0.08, slate, root, 0, 0, 0.87);
    screws(root, 3.2, 3.9, 0.88);
    for (const side of [-1, 1]) {
      box(0.14, 3.75, 1.77, steel, root, 1.56 * side, 0, 0);
      box(0.035, 3.31, 0.04, glow, root, 1.55 * side, 0, 0.91);
      for (let i = 0; i < 12; i++) box(0.09, 0.06, 0.025, slate, root, 1.56 * side, -1.65 + 0.3 * i, 0.91);
    }
    for (let i = 0; i < 6; i++) {
      const sled = new THREE.Group();
      sled.position.y = -1.45 + 0.56 * i;
      root.add(sled);
      sleds.push(sled);
      plate(2.71, 0.47, 1.7, board, sled, 0, 0, 0.02);
      plate(2.65, 0.4, 0.055, steel, sled, 0, 0, 0.93);
      plate(2.47, 0.32, 0.03, board, sled, 0, 0, 0.971);
      box(0.51, 0.13, 0.025, silicon, sled, -0.75, 0, 1.002);
      box(0.047, 0.13, 0.026, power, sled, -1.14, 0, 1.01);
      for (let f = 0; f < 2; f++) {
        const fan = new THREE.Group();
        fan.position.set(0.39 + 0.51 * f, 0, 1.016);
        sled.add(fan);
        fans.push(fan);
        mesh(new THREE.TorusGeometry(0.126, 0.015, 6, 24), slate, fan);
        for (let b = 0; b < 5; b++) {
          const angle = (b / 5) * TAU;
          box(0.095, 0.028, 0.008, steel, fan, 0.058 * Math.cos(angle), 0.058 * Math.sin(angle), 0.013).rotation.z = angle + 0.45;
        }
        mesh(new THREE.CircleGeometry(0.025, 12), slate, fan, 0, 0, 0.02);
      }
      for (const x of [-1.26, 1.26]) box(0.037, 0.22, 0.075, steel, sled, x, 0, 1.02);
    }
    hoses = new THREE.Group();
    root.add(hoses);
    for (const side of [-1.76, 1.76]) {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(side, -1.7, 0.45), new THREE.Vector3(1.13 * side, -1.2, -0.05),
        new THREE.Vector3(1.13 * side, 1.35, -0.05), new THREE.Vector3(side, 1.8, 0.4),
      ]);
      mesh(new THREE.TubeGeometry(curve, 28, 0.035, 8, false), glow, hoses);
      for (const y of [-1.7, 1.8]) box(0.14, 0.12, 0.13, steel, hoses, side, y, 0.4);
    }
    const floor = new THREE.GridHelper(6.4, 12, 0x3d4c42, 0x28352d);
    floor.position.y = -2.08;
    root.add(floor);
    label("HYPERSCALER", "VIRTUAL COMPUTE NODE", 1.56, 0.585, root, 0, -0.84);
  }

  if (kind === "reward") {
    root.rotation.set(-0.05, -0.26, -0.12);
    root.scale.setScalar(1.15);
    const captions = ["GPU / NVIDIA", "MEMORY / MICRON", "STORAGE / SANDISK", "INDEX / NASDAQ-100"];
    ["NVDA", "MU", "SNDK", "QQQ"].forEach((ticker, i) => {
      const group = new THREE.Group();
      root.add(group);
      plate(2.68, 2.24, 0.14, steel, group);
      plate(2.53, 2.09, 0.07, board, group, 0, 0, 0.11);
      pins(group, 2.66, 2.2, -0.04);
      screws(group, 2.68, 2.24, 0.15);
      label(ticker, captions[i], 2.2, 0.825, group, 0.15, 0.19);
      const ticks: THREE.Mesh[] = [];
      for (let t = 0; t < 8; t++) ticks.push(box(0.211, 0.07, 0.025, glow, group, -0.865 + 0.247 * t, -0.72, 0.172));
      const light = box(0.13, 0.028, 0.025, glow, group, -0.98, 0.84, 0.172);
      cards.push({ group, ticks, light });
    });
  }

  if (kind === "token") {
    root.rotation.set(-0.1, -0.32, -0.2);
    tokenModule = new THREE.Group();
    root.add(tokenModule);
    plate(2.52, 2.8, 0.16, alloy, tokenModule);
    plate(2.39, 2.67, 0.05, board, tokenModule, 0, 0, 0.11);
    plate(2.2, 2.48, 0.028, slate, tokenModule, 0, 0, 0.15);
    // The H mark: two uprights and a bar, in silicon.
    const size = 1.05;
    box(0.21 * size, size, 0.045, silicon, tokenModule, -0.34 * size, 0, 0.2);
    box(0.21 * size, size, 0.045, silicon, tokenModule, 0.34 * size, 0, 0.2);
    box(0.49 * size, 0.21 * size, 0.045, silicon, tokenModule, 0, 0, 0.2);
    label("AI STACK", "STOCK-TOKEN REWARDS", 1.7, 0.638, tokenModule, -0.91, 0.18);
    for (const side of [-1, 1]) box(0.025, 1.9, 0.028, glow, tokenModule, 1.15 * side, 0.1, 0.155);
    screws(tokenModule, 2.52, 2.8, 0.13);
    for (let i = 0; i < 40; i++) {
      const angle = 2.39996 * i;
      const radius = 1.8 + (i % 6) * 0.16;
      const shard = plate(0.12 + (i % 3) * 0.035, 0.15, 0.05, i % 5 === 0 ? glow : i % 3 === 0 ? silicon : alloy, root);
      const start = new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0.6 * Math.sin(2 * angle));
      const side = i % 4;
      const t = Math.floor(i / 4) / 9 - 0.5;
      const target = new THREE.Vector3(side < 2 ? 2.45 * t : side === 2 ? -1.33 : 1.33, side < 2 ? (side === 0 ? -1.47 : 1.47) : 2.7 * t, 0.01);
      shard.position.copy(start);
      shards.push({ object: shard, start, target });
    }
  }

  return {
    root,
    textures,
    update(value, time, entranceFinished) {
      clock.value = time;
      const ease = time === 0 ? 1 : 1 - Math.exp(-9 * Math.max(0, time - lastTime));
      lastTime = time;
      if (kind === "core") {
        layers.forEach((l) => {
          const progress = entranceFinished ? 1 : clamp((time - l.delay) / 0.55, 0, 1);
          const back = progress - 1;
          const burst = 1 + 2.1 * back * back * back + 1.1 * back * back;
          l.object.position.copy(l.start).addScaledVector(l.offset, value).multiplyScalar(0.15 + 0.85 * burst);
          l.object.scale.setScalar(Math.max(0.001, burst));
          l.object.visible = progress > 0;
        });
      }
      if (kind === "rig") {
        sleds.forEach((sled, i) => {
          const amount = i === 0 ? 1 : smooth(value - i + 1);
          sled.visible = amount > 0.002;
          sled.position.z = (1 - amount) * 1.65;
          sled.scale.setScalar(0.8 + 0.2 * amount);
        });
        if (hoses) {
          const amount = smooth((value - 2) / 3);
          hoses.visible = amount > 0.01;
          hoses.scale.y = 0.7 + 0.3 * amount;
        }
        fans.forEach((fan, i) => { fan.rotation.z = time * (1.4 + 0.18 * value) + i; });
      }
      cards.forEach((card, i) => {
        const current = Math.min(3, Math.floor((4 * value) / 3 + 1e-4));
        const offset = i - current;
        const selected = i === current ? 1 : 0;
        scratch.set(0.55 * offset, 0.37 * offset, -0.8 * Math.abs(offset) + 0.55 * selected);
        card.group.position.lerp(scratch, ease);
        card.group.rotation.y += (0.055 * offset - card.group.rotation.y) * ease;
        const scale = card.group.scale.x + (0.9 + 0.1 * selected - card.group.scale.x) * ease;
        card.group.scale.setScalar(scale);
        card.ticks.forEach((tick, t) => { tick.material = i < current || (selected && t / 8 <= (4 * value) / 3 - current + 0.08) ? glow : boardLight; });
        card.light.material = selected > 0.5 ? power : boardLight;
      });
      shards.forEach((shard, i) => {
        const amount = smooth(1.3 * value - (i % 5) * 0.075);
        shard.object.position.lerpVectors(shard.start, shard.target, amount);
        shard.object.rotation.set((1 - amount) * Math.sin(i), (1 - amount) * (0.12 * time + i), (1 - amount) * i * 0.38);
        shard.object.position.y += 0.035 * Math.sin(0.6 * time + i) * (1 - amount);
      });
      if (tokenModule) tokenModule.rotation.y = -((1 - value) * 0.12);
    },
  };
}

interface Atmosphere {
  root: THREE.Group;
  resize(width: number, pixelRatio: number): void;
  update(value: number, time: number, entranceFinished: boolean, yaw: number, pitch: number): void;
}

/** Shards, chips and dust on a tilted orbit around the subject; every scene has its own orbit shape. */
function buildAtmosphere(kind: SceneKind): Atmosphere {
  const root = new THREE.Group();
  root.name = `vram-atmosphere-${kind}`;
  const orbit = {
    core: { x: 3.12, y: 2.47, tilt: 0.32, depth: 1.15, count: 24, phase: 0.1, channel: 1 },
    rig: { x: 2.65, y: 2.68, tilt: -0.12, depth: 0.95, count: 22, phase: 1.8, channel: 0.48 },
    reward: { x: 3.24, y: 2.05, tilt: 0.24, depth: 1.25, count: 24, phase: 3.4, channel: 1 },
    token: { x: 2.66, y: 2.6, tilt: -0.28, depth: 0.9, count: 18, phase: 4.6, channel: 1 },
  }[kind];
  // Debris field: every fragment has its own random direction, distance, size and tumble, so the cloud
  // reads as an explosion frozen mid-burst rather than a ring (client note 2026-09-09).
  const count = Math.round(orbit.count * 1.7);
  const chipCount = 72;
  const material = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.12, emissive: SILICON_PALETTE.power, emissiveIntensity: 0.13 });
  const shards = new THREE.InstancedMesh(shardGeometry(), material, count);
  const chips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 0.12), material, chipCount);
  for (const instanced of [shards, chips]) {
    instanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instanced.frustumCulled = false;
    root.add(instanced);
  }
  for (let i = 0; i < count; i++) shards.setColorAt(i, new THREE.Color(i % 3 === 0 ? SILICON_PALETTE.mint : i % 4 === 0 ? 0x67dc85 : 0x00d90a));
  for (let i = 0; i < chipCount; i++) chips.setColorAt(i, new THREE.Color(i % 3 === 0 ? 0xc8e4d0 : i % 5 === 0 ? 0x1c5d32 : 0x00e516));
  interface Debris { dir: THREE.Vector3; dist: number; size: number; stretch: THREE.Vector3; spin: THREE.Vector3; tumble: number; delay: number; wobble: number }
  const scatter = (salt: number, r: number) => (hash(salt, r) - 0.5) * 2;
  function debris(i: number, salt: number, inner: number, outer: number, minSize: number, maxSize: number): Debris {
    // Direction: random on the sphere, squashed to the scene's ellipse so the field frames the subject.
    const dir = new THREE.Vector3(scatter(i, salt + 1.1), scatter(i, salt + 2.3) * (orbit.y / orbit.x), scatter(i, salt + 3.7) * 0.55).normalize();
    // Distance: most fragments near the blast front, a long tail flung far out.
    const dist = inner + (outer - inner) * Math.pow(hash(i, salt + 4.9), 0.55);
    // Size: log-uniform, so big slabs and tiny chips share the same field.
    const size = minSize * Math.pow(maxSize / minSize, hash(i, salt + 6.1));
    const stretch = new THREE.Vector3(0.55 + 1.6 * hash(i, salt + 7.3), 0.45 + 1.1 * hash(i, salt + 8.7), 0.6 + 0.8 * hash(i, salt + 9.1));
    const spin = new THREE.Vector3(scatter(i, salt + 10.3), scatter(i, salt + 11.9), scatter(i, salt + 12.7));
    const tumble = 0.35 + 1.9 * Math.pow(hash(i, salt + 13.1), 2); // a few fragments spin fast, most drift
    return { dir, dist, size, stretch, spin, tumble, delay: hash(i, salt + 14.3) * 0.35, wobble: hash(i, salt + 15.7) * TAU };
  }
  const shardField = Array.from({ length: count }, (_, i) => debris(i, 31.7, orbit.x * 0.55, orbit.x * 1.55, 0.07, 0.62));
  const chipField = Array.from({ length: chipCount }, (_, i) => debris(i, 77.3, orbit.x * 0.4, orbit.x * 1.8, 0.03, 0.26));
  const burst = (t: number) => 1 - Math.pow(1 - clamp(t, 0, 1), 4); // ease-out-quart: hard launch, long settle
  const dummy = new THREE.Object3D();
  const point = new THREE.Vector3();
  function place(angle: number, radius: number, z: number, progress: number, out: THREE.Vector3) {
    const spread = kind === "core" ? 1 + 0.07 * progress : kind === "token" ? 1 - 0.075 * progress : 1;
    const c = Math.cos(angle);
    const x = Math.sign(c) * Math.pow(Math.abs(c), orbit.channel) * orbit.x * radius * spread;
    const y = Math.sin(angle) * orbit.y * radius * spread;
    const tilt = orbit.tilt;
    out.set(x * Math.cos(tilt) - y * Math.sin(tilt), x * Math.sin(tilt) + y * Math.cos(tilt), Math.sin(2 * angle + 0.4) * orbit.depth + z);
  }
  const rings = new THREE.Group();
  const ringMaterial = new THREE.LineBasicMaterial({ color: 0x52ac69, transparent: true, opacity: 0.19, depthWrite: false });
  for (let r = 0; r < 2; r++) {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 150; i++) {
      place(((i / 150) * 1.62 + 0.88 * r) * Math.PI, 0.91 + 0.12 * r, -0.38, 0, point);
      points.push(point.clone());
    }
    rings.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), ringMaterial));
  }
  root.add(rings);

  const dustGeometry = new THREE.BufferGeometry();
  const seeds = new Float32Array(1200 * 4);
  for (let i = 0; i < 1200; i++) {
    seeds[i * 4] = hash(i, 12.98) * TAU;
    seeds[i * 4 + 1] = 0.84 + 0.28 * hash(i, 48.12);
    seeds[i * 4 + 2] = (hash(i, 29.72) - 0.5) * 0.65;
    seeds[i * 4 + 3] = 0.035 + 0.072 * Math.pow(hash(i, 76.23), 3);
  }
  dustGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(1200 * 3), 3));
  dustGeometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 4));
  const uniforms = {
    uTime: { value: 0 }, uProgress: { value: 0 }, uPixelRatio: { value: 1 },
    uRadius: { value: new THREE.Vector2(orbit.x, orbit.y) }, uTilt: { value: orbit.tilt }, uDepth: { value: orbit.depth },
    uChannel: { value: orbit.channel }, uEnergy: { value: 1 }, uEntrance: { value: 1 },
  };
  const dustMaterial = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute vec4 aSeed;
      uniform float uTime, uProgress, uPixelRatio, uTilt, uDepth, uEnergy, uEntrance, uChannel;
      uniform vec2 uRadius;
      varying float vLight;
      void main() {
        float a = aSeed.x + uTime * (.09 + aSeed.z * .05) * uEnergy + uProgress * .16;
        float c = cos(a);
        vec2 p = vec2(sign(c) * pow(abs(c), uChannel), sin(a)) * uRadius * aSeed.y;
        p = mat2(cos(uTilt), sin(uTilt), -sin(uTilt), cos(uTilt)) * p;
        vec3 position = vec3(p, sin(a * 2.0 + .4) * uDepth + aSeed.z - .38);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp(aSeed.w * uPixelRatio * 260.0 / -mv.z, 1.0, 4.5);
        vLight = (.36 + .64 * pow(.5 + .5 * sin(aSeed.x * 4.0 - uTime * .3), 3.0)) * uEntrance;
      }
    `,
    fragmentShader: /* glsl */`
      varying float vLight;
      void main() {
        vec2 p = abs(gl_PointCoord - .5);
        float square = 1.0 - smoothstep(.28, .5, max(p.x, p.y));
        vec3 color = mix(vec3(.06, .68, .17), vec3(.68, 1.0, .77), vLight * .68);
        gl_FragColor = vec4(color, square * vLight * .8);
      }
    `,
  });
  const dust = new THREE.Points(dustGeometry, dustMaterial);
  dust.frustumCulled = false;
  root.add(dust);
  let narrow = false;

  return {
    root,
    resize(width, pixelRatio) {
      narrow = width < 520;
      uniforms.uPixelRatio.value = pixelRatio;
      dustGeometry.setDrawRange(0, narrow ? 600 : 1200);
      shards.count = narrow ? Math.ceil(0.75 * count) : count;
      chips.count = narrow ? Math.ceil(0.6 * chipCount) : chipCount;
    },
    update(value, time, entranceFinished, yaw, pitch) {
      const progress = value / (kind === "rig" ? 5 : kind === "reward" ? 3 : 1);
      uniforms.uTime.value = time;
      uniforms.uProgress.value = progress;
      uniforms.uEnergy.value = kind === "rig" ? 1 + 0.5 * progress : 1;
      uniforms.uEntrance.value = entranceFinished ? 1 : THREE.MathUtils.smoothstep(time, 0.12, 0.85);
      rings.rotation.z = 0.045 * progress;
      root.rotation.y = 0.2 * yaw;
      root.rotation.x = 0.14 * pitch;
      const spread = kind === "core" ? 1 + 0.35 * progress : kind === "token" ? 1 - 0.3 * progress : 1 + 0.12 * progress;
      const fields: [THREE.InstancedMesh, Debris[]][] = [[shards, shardField], [chips, chipField]];
      for (const [mesh, field] of fields) {
        for (let i = 0; i < mesh.count; i++) {
          const d = field[i];
          // Entrance: flung out from the centre with an overshoot; afterwards the field breathes and drifts.
          const launch = entranceFinished ? 1 : burst((time - d.delay) / 0.7);
          const overshoot = entranceFinished ? 1 : 1 + 0.35 * Math.sin(clamp((time - d.delay) / 0.7, 0, 1) * Math.PI);
          const breathe = 1 + 0.06 * Math.sin(time * 0.9 + d.wobble) + 0.04 * Math.sin(time * 2.3 + d.wobble * 1.7);
          const dist = d.dist * launch * overshoot * spread * breathe;
          dummy.position.copy(d.dir).multiplyScalar(dist);
          dummy.position.x += 0.12 * Math.sin(time * 1.3 + d.wobble);
          dummy.position.y += 0.1 * Math.cos(time * 1.1 + d.wobble * 2.1);
          dummy.position.z += 0.08 * Math.sin(time * 1.7 + d.wobble * 0.6);
          // Slow orbital drift so the field never freezes.
          dummy.position.applyAxisAngle(AXIS_Y, time * 0.06 + 0.2 * progress);
          const spin = time * d.tumble;
          dummy.rotation.set(d.wobble + d.spin.x * spin, d.wobble * 1.3 + d.spin.y * spin, d.spin.z * spin);
          const size = d.size * launch * (narrow ? 0.85 : 1);
          dummy.scale.set(size * d.stretch.x, size * d.stretch.y, size * d.stretch.z);
          dummy.updateMatrix();
          mesh.setMatrixAt(i, dummy.matrix);
        }
      }
      shards.instanceMatrix.needsUpdate = true;
      chips.instanceMatrix.needsUpdate = true;
    },
  };
}
