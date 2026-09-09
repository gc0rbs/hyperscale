import * as THREE from "three";

/** Hyperscaler art direction (design handoff 2026-09-09): graphite boards, brushed alloy, $VRAM green. */
export const SILICON_PALETTE = {
  power: 0x00c805, // --lp-power: the $VRAM green
  signal: 0x53db72, // --lp-signal: lit traces and status
  mint: 0xd8f4df,
  ink: 0x141618,
};

/**
 * The silicon die: a clearcoated green physical material whose emissive layer carries a circuit grid
 * and a scan line driven by the scene clock, so the processor reads as "computing" without any
 * geometry moving.
 */
export function createSiliconMaterial(clock: THREE.IUniform<number>) {
  const material = new THREE.MeshPhysicalMaterial({
    color: SILICON_PALETTE.power, metalness: 0.78, roughness: 0.24,
    clearcoat: 0.65, clearcoatRoughness: 0.2,
    emissive: SILICON_PALETTE.power, emissiveIntensity: 0.22,
  });
  material.onBeforeCompile = shader => {
    shader.uniforms.uComputeTime = clock;
    shader.vertexShader = `varying vec3 vSilicon;\n${shader.vertexShader}`.replace(
      "#include <begin_vertex>", "#include <begin_vertex>\nvSilicon = position;",
    );
    shader.fragmentShader = `uniform float uComputeTime;\nvarying vec3 vSilicon;\n${shader.fragmentShader}`.replace(
      "#include <emissivemap_fragment>", /* glsl */`
        #include <emissivemap_fragment>
        vec2 grid = abs(fract(vSilicon.xy * 9.0) - 0.5);
        float circuit = 1.0 - smoothstep(0.42, 0.49, max(grid.x, grid.y));
        float scan = pow(0.5 + 0.5 * sin(vSilicon.y * 3.0 - uComputeTime * 1.4), 12.0);
        totalEmissiveRadiance *= 0.22 + circuit * 0.7 + scan * 0.65;
        diffuseColor.rgb *= 0.72 + circuit * 0.28;
      `,
    );
  };
  material.customProgramCacheKey = () => "hyperscaler-silicon-v1";
  return material;
}

/** A small card-lit studio baked into the environment map: cool white key, green fills, no warm light. */
export function createComputeEnvironment() {
  const environment = new THREE.Scene();
  environment.background = new THREE.Color(0x252b28);
  const cards: [number, number, number, number, number, number, number][] = [
    [-4, 5, 5, 7, 3, 0xf4fff7, 4],
    [5, 2, 1, 2, 8, SILICON_PALETTE.signal, 2.6],
    [-3, -2, 3, 2, 5, SILICON_PALETTE.power, 1.8],
    [0, 6, -4, 6, 2, 0xffffff, 3],
  ];
  const meshes: THREE.Mesh[] = [];
  cards.forEach(([x, y, z, w, h, color, intensity]) => {
    const card = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    card.position.set(x, y, z);
    card.lookAt(0, 0, 0);
    environment.add(card);
    meshes.push(card);
  });
  return {
    scene: environment,
    dispose() { meshes.forEach(m => { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }); },
  };
}

/** A board or die: a chamfered plate with a tiny bevel so edges catch the key light. */
export function plateGeometry(width: number, height: number, depth: number, chamfer = 0.12) {
  const hw = width / 2;
  const hh = height / 2;
  const c = Math.min(chamfer, hw * 0.3, hh * 0.3);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + c, -hh);
  shape.lineTo(hw - c, -hh);
  shape.lineTo(hw, -hh + c);
  shape.lineTo(hw, hh - c);
  shape.lineTo(hw - c, hh);
  shape.lineTo(-hw + c, hh);
  shape.lineTo(-hw, hh - c);
  shape.lineTo(-hw, -hh + c);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.015, bevelThickness: 0.012 });
  geometry.translate(0, 0, -depth / 2);
  return geometry;
}

/** The hexagonal shard that orbits every scene (the "shard" of the reward fiction). */
export function shardGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.48, -0.28);
  shape.lineTo(0.12, -0.5);
  shape.lineTo(0.5, -0.15);
  shape.lineTo(0.27, 0.42);
  shape.lineTo(-0.16, 0.5);
  shape.lineTo(-0.42, 0.14);
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: 0.075, steps: 1, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.035, bevelThickness: 0.026 });
}
