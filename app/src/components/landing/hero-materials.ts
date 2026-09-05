import * as THREE from "three";
import { ConvexGeometry } from "three/addons/geometries/ConvexGeometry.js";

export const MINERAL_PALETTE = {
  amber: 0xffb33e,
  ivory: 0xffedbd,
  cyan: 0x45e6ec,
};

// Object-space detail stays attached to each fragment as the mineral rotates and opens.
const mineralNoise = /* glsl */`
  varying vec3 vMineralPosition;
  float mineralHash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.17, 0.31, 0.73));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float mineralNoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(mineralHash(i), mineralHash(i + vec3(1,0,0)), f.x),
                   mix(mineralHash(i + vec3(0,1,0)), mineralHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(mineralHash(i + vec3(0,0,1)), mineralHash(i + vec3(1,0,1)), f.x),
                   mix(mineralHash(i + vec3(0,1,1)), mineralHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  vec3 mineralBump(vec3 n, float height) {
    vec3 dx = dFdx(-vViewPosition), dy = dFdy(-vViewPosition);
    vec3 r1 = cross(dy, n), r2 = cross(n, dx);
    float det = dot(dx, r1);
    return normalize(abs(det) * n - sign(det) * (dFdx(height) * r1 + dFdy(height) * r2));
  }
`;

function addSurfaceDetail(material: THREE.MeshStandardMaterial, surface: "basalt" | "amber") {
  material.onBeforeCompile = shader => {
    shader.vertexShader = `varying vec3 vMineralPosition;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\nvMineralPosition = position;",
    );
    // Insert after the built-in varyings so the bump function can use vViewPosition.
    shader.fragmentShader = shader.fragmentShader.replace("#include <common>", `#include <common>\n${mineralNoise}`);
    const detail = surface === "basalt" ? /* glsl */`
      float strata = mineralNoise(vMineralPosition * vec3(9.0, 18.0, 9.0)) * 0.55
        + mineralNoise(vMineralPosition * 24.0) * 0.30 + mineralNoise(vMineralPosition * 48.0) * 0.15;
      float grain = mineralNoise(vMineralPosition * 60.0);
      float pores = mineralNoise(vMineralPosition * 150.0);
      float fissure = 1.0 - smoothstep(0.004, 0.014, abs(strata - 0.48));
      float mineralHeight = strata * 0.014 + grain * 0.0025 + pores * 0.0006 - fissure * 0.001;
      diffuseColor.rgb *= mix(vec3(0.44, 0.48, 0.50), vec3(1.18, 1.12, 1.00), strata);
      diffuseColor.rgb *= 0.72 + grain * 0.48;
      diffuseColor.rgb *= 1.0 - fissure * 0.3;
      diffuseColor.rgb += vec3(0.025, 0.022, 0.018) * smoothstep(0.72, 0.88, pores);
    ` : /* glsl */`
      float strata = mineralNoise(vMineralPosition * 7.0);
      float grain = mineralNoise(vMineralPosition * 105.0);
      float mineralHeight = grain * 0.00015;
      diffuseColor.rgb *= mix(vec3(1.0, 0.68, 0.26), vec3(1.0, 0.96, 0.83), strata);
    `;
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <color_fragment>", `#include <color_fragment>\n${detail}`)
      .replace("#include <roughnessmap_fragment>", `#include <roughnessmap_fragment>\nroughnessFactor = ${surface === "basalt" ? "clamp(0.78 + grain * 0.20 - fissure * 0.08, 0.6, 1.0)" : "0.055 + strata * 0.06 + grain * 0.015"};`)
      .replace("#include <normal_fragment_maps>", "#include <normal_fragment_maps>\nnormal = mineralBump(normal, mineralHeight);");
  };
  material.customProgramCacheKey = () => `hero-mineral-${surface}-v2`;
  return material;
}

export function createBasaltMaterial() {
  return addSurfaceDetail(new THREE.MeshStandardMaterial({
    color: 0x302725, metalness: 0.06, roughness: 0.9, flatShading: true,
  }), "basalt");
}

export function createAmberMaterial() {
  const material = new THREE.MeshPhysicalMaterial({
    color: 0xffbd49, metalness: 0.04, roughness: 0.1,
    transmission: 0.6, thickness: 1.8, ior: 1.6,
    attenuationColor: new THREE.Color(0xffa526), attenuationDistance: 1.8,
    emissive: 0xff8508, emissiveIntensity: 0.07,
    clearcoat: 1, clearcoatRoughness: 0.065, flatShading: true,
    envMapIntensity: 0.9,
  });
  addSurfaceDetail(material, "amber");
  return material;
}

// Truncated corners add small highlight-catching faces without rounding the mineral into a sphere.
export function fractureGeometry(radius: number, seed: number, stone: boolean) {
  const base = new THREE.IcosahedronGeometry(radius, stone ? 1 : 0);
  const attribute = base.getAttribute("position");
  const points = new Map<string, THREE.Vector3>();
  for (let i = 0; i < attribute.count; i++) {
    const p = new THREE.Vector3().fromBufferAttribute(attribute, i);
    const key = `${p.x.toFixed(5)},${p.y.toFixed(5)},${p.z.toFixed(5)}`;
    if (!points.has(key)) {
      const noise = Math.sin(p.x * 47.1 + p.y * 19.7 + p.z * 33.3 + seed * 17.1) * 43758.5453;
      if (stone) p.multiplyScalar(0.80 + (noise - Math.floor(noise)) * 0.35);
      points.set(key, p);
    }
  }
  base.dispose();
  const vertices = [...points.values()];
  const bevelled: THREE.Vector3[] = [];
  vertices.forEach((p, i) => {
    const neighbours = vertices.filter((_, j) => i !== j).sort((a, b) => p.distanceToSquared(a) - p.distanceToSquared(b)).slice(0, 5);
    neighbours.forEach(q => bevelled.push(p.clone().lerp(q, stone ? 0.055 : 0.045)));
  });
  return new ConvexGeometry(bevelled);
}

export function createSeamMaterial(time: THREE.IUniform<number>) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x008797, emissive: 0x008ba3, emissiveIntensity: 1.2,
    metalness: 0.08, roughness: 0.65, envMapIntensity: 0.5, flatShading: true,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uMineralTime = time;
    shader.vertexShader = `varying vec3 vSeamPosition;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\nvSeamPosition = position;",
    );
    shader.fragmentShader = `uniform float uMineralTime;\nvarying vec3 vSeamPosition;\n${shader.fragmentShader}`.replace(
      "#include <emissivemap_fragment>", /* glsl */`
        #include <emissivemap_fragment>
        float pulse = pow(0.5 + 0.5 * sin(vSeamPosition.y * 3.2 - uMineralTime * 1.1), 8.0);
        totalEmissiveRadiance *= 0.9 + pulse * 0.2;
      `,
    );
  };
  material.customProgramCacheKey = () => "mineral-cyan-v4";
  return material;
}

export function createMineralEnvironment() {
  const environment = new THREE.Scene();
  environment.background = new THREE.Color(0x433024);
  const cards: [number, number, number, number, number, number, number][] = [
    [-4, 5, 3, 3, 6, 0xffefcc, 5],
    [4, 1, 1, 1.2, 5, 0xb6f4f3, 2.5],
    [-2, -1, -4, 3, 4, 0xffb02f, 5],
    [0, 5, -2, 2, 2, 0xfff7e6, 3],
    [1, -2, 4, 4, 2, 0xffc253, 2],
  ];
  cards.forEach(([x, y, z, w, h, color, intensity]) => {
    const material = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide });
    const card = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
    card.position.set(x, y, z);
    card.lookAt(0, 0, 0);
    environment.add(card);
  });
  return {
    scene: environment,
    dispose() { environment.traverse(item => { if (item instanceof THREE.Mesh) { item.geometry.dispose(); item.material.dispose(); } }); },
  };
}
