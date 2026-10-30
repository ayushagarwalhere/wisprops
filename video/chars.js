// The developer: "Nerd Survivor" by HighPolyDensity (CC BY 4.0), trimmed to the animations we use (models/dev.glb).
// Poses are deterministic: pose() sets animation times directly, then bends the legs and turns the head from the skeleton.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { clone as cloneSkinned } from "three/addons/utils/SkeletonUtils.js";

export async function loadDevModel(url = "models/dev.glb") {
  return new GLTFLoader().loadAsync(url);
}

const HIP_Y = 0.7; // hip height of the model at scale 1
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _p = new THREE.Quaternion();

// Rotate a bone by a world-space rotation, keeping its children attached.
function rotateWorld(bone, qWorld) {
  bone.getWorldQuaternion(_q);
  _q.premultiply(qWorld);
  bone.parent.getWorldQuaternion(_p);
  bone.quaternion.copy(_p.invert().multiply(_q));
  bone.updateMatrixWorld(true);
}
// Point a bone (from it toward its child joint) along a world direction.
function aim(bone, child, dir) {
  bone.getWorldPosition(_v); child.getWorldPosition(_w);
  const from = _w.sub(_v).normalize();
  rotateWorld(bone, new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize()));
}

export function makeDev(gltf, scale) {
  const model = cloneSkinned(gltf.scene);
  const rig = new THREE.Group(); // place and rotate this; it pivots at the hips
  const inner = new THREE.Group(); inner.scale.setScalar(scale); rig.add(inner); // the model joins it after the face is measured at scale 1
  model.updateMatrixWorld(true);
  model.traverse((o) => { if (o.isSkinnedMesh) o.skeleton.update(); });
  model.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; if (o.material) { o.material.roughness = Math.max(0.6, o.material.roughness ?? 1); o.material.metalness = 0; } } });
  model.updateMatrixWorld(true);

  const bone = (prefix) => { let b; model.traverse((o) => { if (!b && o.isBone && o.name.startsWith(prefix)) b = o; }); return b; };
  const B = {
    root: bone("Root_01"), head: bone("Head_07"), neck: bone("Spine_5_06"), chest: bone("Spine_3_04"),
    thighR: bone("Leg_1_R"), shinR: bone("Leg_2_R_"), footR: bone("Leg_3_R"),
    thighL: bone("Leg_1_L"), shinL: bone("Leg_2_L_"), footL: bone("Leg_3_L"),
  };
  const rootPos0 = B.root.position.clone();

  // A face for lip-sync: the model has glasses but no mouth or brows. Find the face surface by casting rays in the bind pose.
  const body = []; model.traverse((o) => { if (o.isSkinnedMesh && /Character_Mat/.test(o.name)) body.push(o); });
  const ray = new THREE.Raycaster();
  const surface = (x, y) => { ray.set(new THREE.Vector3(x, y, 3), new THREE.Vector3(0, 0, -1)); const h = ray.intersectObjects(body, false)[0]; return h ? h.point : new THREE.Vector3(x, y, 0.3); };
  const onHead = (mesh, x, y, push = 0.006) => {
    const p = surface(x, y); p.z += push;
    const n = new THREE.Vector3(p.x * 0.6, (p.y - 1.67) * 0.6, p.z - 0.02).normalize();
    mesh.position.copy(B.head.worldToLocal(p.clone()));
    B.head.getWorldQuaternion(_q);
    mesh.quaternion.copy(_q.invert().multiply(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n)));
    B.head.add(mesh);
    return mesh;
  };
  const mouthMat = new THREE.MeshStandardMaterial({ color: "#5a2430", roughness: 0.6 });
  const mouth = onHead(new THREE.Mesh(new THREE.SphereGeometry(0.05, 20, 12), mouthMat), 0, 1.47);
  mouth.scale.set(1, 0.2, 0.25);
  const browMat = new THREE.MeshStandardMaterial({ color: "#6b4a35", roughness: 0.8 });
  const brows = [-1, 1].map((s) => { const b = onHead(new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.07, 4, 8), browMat), s * 0.1, 1.76, 0.004); b.userData.s = s; b.userData.q0 = b.quaternion.clone(); return b; });

  const headLocal = B.head.worldToLocal(new THREE.Vector3(0.004, 1.67, 0.02));
  model.position.y = -HIP_Y; // the rig's origin is at the hips
  inner.add(model);
  rig.updateMatrixWorld(true);

  const mixer = new THREE.AnimationMixer(model);
  const clips = Object.fromEntries(gltf.animations.map((a) => [a.name, a]));
  const actions = {};
  for (const n in clips) { const a = mixer.clipAction(clips[n]); a.play(); a.enabled = false; actions[n] = a; }
  // pose() turns these bones on top of the animation. The mixer only rewrites a bone when its value changes, so undo
  // our turns before it runs, or they pile up frame after frame (the head ends up facing the wall).
  const turned = [B.chest, B.neck, B.head, B.thighR, B.shinR, B.thighL, B.shinL];
  let fromMixer = null;

  /**
   * layers: [[clipName, timeSeconds, weight], ...]
   * sit: "chair" | "bed" | null (leg directions in world space)
   * yaw/pitch: extra head turn in radians; talk: mouth opening 0..1; worried: 0..1
   */
  function pose({ layers, sit = null, yaw = 0, pitch = 0, lean = 0, talk = 0, worried = 0 }) {
    if (fromMixer) turned.forEach((b, i) => b.quaternion.copy(fromMixer[i]));
    for (const n in actions) { actions[n].enabled = false; actions[n].setEffectiveWeight(0); }
    for (const [n, t, w] of layers) {
      const a = actions[n]; if (!a || w <= 0) continue;
      a.enabled = true; a.setEffectiveWeight(w); a.time = ((t % clips[n].duration) + clips[n].duration) % clips[n].duration;
    }
    mixer.update(0);
    fromMixer = turned.map((b) => b.quaternion.clone());
    B.root.position.x = rootPos0.x; B.root.position.z = rootPos0.z; // no root motion
    rig.updateMatrixWorld(true);
    if (lean) rotateWorld(B.chest, _p.setFromAxisAngle(new THREE.Vector3(1, 0, 0).applyQuaternion(rig.getWorldQuaternion(new THREE.Quaternion())), lean).clone());
    if (yaw || pitch) {
      const up = new THREE.Vector3(0, 1, 0), side = new THREE.Vector3(1, 0, 0).applyQuaternion(rig.getWorldQuaternion(new THREE.Quaternion()));
      rotateWorld(B.neck, new THREE.Quaternion().setFromAxisAngle(up, yaw * 0.4));
      rotateWorld(B.head, new THREE.Quaternion().setFromAxisAngle(up, yaw * 0.6).multiply(new THREE.Quaternion().setFromAxisAngle(side, pitch)));
    }
    if (sit) {
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(rig.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion())).setY(0).normalize();
      if (sit === "bed") fwd.set(0, 0, 1);
      for (const [th, sh, x] of [[B.thighR, B.shinR, -0.04], [B.thighL, B.shinL, 0.04]]) {
        if (sit === "chair") {
          aim(th, sh, fwd.clone().multiplyScalar(1).add(new THREE.Vector3(x, -0.12, 0)));
          aim(sh, B[th === B.thighR ? "footR" : "footL"], new THREE.Vector3(x * 0.5, -1, 0.12));
        } else {
          aim(th, sh, new THREE.Vector3(x, -0.02, 1));
          aim(sh, B[th === B.thighR ? "footR" : "footL"], new THREE.Vector3(x * 0.5, -0.02, 1));
        }
      }
    }
    mouth.scale.set(1 - talk * 0.15, 0.2 + talk * 0.75, 0.25);
    for (const b of brows) {
      b.quaternion.copy(b.userData.q0).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2 + b.userData.s * (-0.35 * worried + 0.05)));
    }
    rig.updateMatrixWorld(true);
  }
  const headWorld = () => B.head.localToWorld(headLocal.clone()); // centre of the big head
  return { rig, model, pose, bones: B, headWorld, mouth, brows };
}

// The WisprOps mascot: the Dokibird bird (models/mascot.glb). Rigged, no animations: we move its bones.
export async function loadMascotModel(url = "models/mascot.glb") {
  return new GLTFLoader().loadAsync(url);
}
export function makeMascot(gltf, scale = 1) {
  const root = gltf.scene;
  root.scale.setScalar(scale);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const m = o.material;
    // Its colours are emissive (a toon export). Keep them, and let the room's light shade it a little.
    if (m && m.emissive && !/outline/i.test(m.name)) { m.color.copy(m.emissive).multiplyScalar(0.55); m.emissiveIntensity = 0.62; m.roughness = 0.7; m.metalness = 0; }
  });
  // Cuter: darker eyes so they read at a glance, and pinker cheeks.
  root.traverse((o) => {
    if (!o.isMesh || !o.material) return;
    if (o.material.name === "BirbEyes") { o.material.color.set("#2a1a17"); o.material.emissive?.set("#120a08"); }
    if (o.material.name === "BlushColor") { o.material.color.set("#ff8fa8"); o.material.emissive?.set("#ff7f9a"); o.material.emissiveIntensity = 0.75; }
  });
  root.updateMatrixWorld(true);
  const bone = (n) => root.getObjectByName(n);
  const B = { beak: bone("BeakBottom"), armL: bone("Arm_L"), armR: bone("Arm_R"), eyeL: bone("Eye_L"), eyeR: bone("Eye_R"), face: bone("Face") };
  const q0 = Object.fromEntries(Object.entries(B).map(([k, b]) => [k, b.quaternion.clone()]));
  const X = new THREE.Vector3(1, 0, 0), Z = new THREE.Vector3(0, 0, 1);
  // The model's eyes are slanted strokes, which read as cross. Turned level and squashed, they become round bean eyes.
  const EYE = { turn: -0.55, w: 0.45, h: 2.2, d: 1.5 };
  /** talk 0..1 opens the beak; flap lifts the wings; blink 1 open .. 0 shut; look turns the face; tilt rolls it. */
  function pose({ talk = 0, flap = 0, blink = 1, look = 0, tilt = 0 }) {
    B.beak.quaternion.copy(q0.beak).multiply(new THREE.Quaternion().setFromAxisAngle(X, talk * 0.55));
    for (const [k, s] of [["armL", 1], ["armR", -1]]) {
      B[k].quaternion.copy(q0[k]);
      B[k].updateMatrixWorld(true);
      rotateWorld(B[k], new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1).applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion())), s * flap));
    }
    for (const [k, s] of [["eyeL", 1], ["eyeR", -1]]) {
      B[k].quaternion.copy(q0[k]).multiply(new THREE.Quaternion().setFromAxisAngle(Z, EYE.turn * s));
      B[k].scale.set(EYE.w, EYE.h, EYE.d * Math.max(0.12, blink));
    }
    B.face.quaternion.copy(q0.face).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), look)).multiply(new THREE.Quaternion().setFromAxisAngle(Z, tilt));
    root.updateMatrixWorld(true);
  }
  return { root, pose, bones: B };
}
