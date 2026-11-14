// camera.js — keyframed camera rig evaluated purely from t.
import * as THREE from "three";
import { toEase, clamp } from "./time.js";

const v3 = (a) => (a?.isVector3 ? a.clone() : new THREE.Vector3(a[0], a[1], a[2]));

/**
 * createCameraRig(camera, keys, opts?) -> rig
 *   keys: [{ t, pos:[x,y,z], target:[x,y,z], fov?, roll?, ease?, path?, viewHeight? }]  (sorted by t; ease
 *         and path apply to the segment ARRIVING at this key; ease default "inOutCubic")
 *         path: "linear" (default — position lerps in a straight line, so a big swing cuts through the
 *               middle and comes closer to the target; add keys) | "arc" — the offset from the target is
 *               interpolated in cylindrical coordinates around +Y (azimuth the short way, horizontal radius
 *               and height lerped): one key pair makes a clean orbit at constant distance.
 *         viewHeight: orthographic cameras only — full frame height in world units (otherwise the frame is
 *               derived from fov and the camera-to-target distance, see core.makeOrthoCamera).
 *   opts: { drift?: { amp = 0.15, speed = 0.25, orbit = 0 } }
 *         drift adds a gentle deterministic sway (sin/cos of t) — amp in world units, orbit in
 *         radians/second around the current target (applied continuously, including during holds).
 *   rig.update(t)   -> sets camera position/target/fov/roll for time t (call inside renderAt)
 *   rig.sample(t)   -> { pos, target, fov, roll } without touching the camera
 */
export function createCameraRig(camera, keys, opts = {}) {
  const K = keys.map((k) => ({
    t: k.t,
    pos: v3(k.pos),
    target: v3(k.target ?? [0, 0, 0]),
    fov: k.fov ?? camera.fov,
    roll: k.roll ?? 0,
    ease: k.ease ?? "inOutCubic",
    path: k.path ?? "linear",
    viewHeight: k.viewHeight ?? null,
  }));
  K.sort((a, b) => a.t - b.t);
  const drift = opts.drift ?? null;

  function sample(t) {
    let a = K[0], b = K[0], u = 0;
    if (t >= K[K.length - 1].t) a = b = K[K.length - 1];
    else if (t > K[0].t) {
      for (let i = 0; i < K.length - 1; i++) {
        if (t >= K[i].t && t < K[i + 1].t) {
          a = K[i];
          b = K[i + 1];
          u = toEase(b.ease)(clamp((t - a.t) / (b.t - a.t)));
          break;
        }
      }
    }
    const target = a.target.clone().lerp(b.target, u);
    let pos;
    if (b.path === "arc" && a !== b) {
      const oa = a.pos.clone().sub(a.target), ob = b.pos.clone().sub(b.target);
      const ra = Math.hypot(oa.x, oa.z), rb = Math.hypot(ob.x, ob.z);
      const aa = Math.atan2(oa.x, oa.z);
      let da = Math.atan2(ob.x, ob.z) - aa;
      da = Math.atan2(Math.sin(da), Math.cos(da)); // shortest way round
      const az = aa + da * u, r = ra + (rb - ra) * u;
      pos = new THREE.Vector3(target.x + Math.sin(az) * r, target.y + oa.y + (ob.y - oa.y) * u, target.z + Math.cos(az) * r);
    } else pos = a.pos.clone().lerp(b.pos, u);
    const viewHeight = a.viewHeight != null && b.viewHeight != null ? a.viewHeight + (b.viewHeight - a.viewHeight) * u : b.viewHeight ?? a.viewHeight;
    const fov = a.fov + (b.fov - a.fov) * u;
    const roll = a.roll + (b.roll - a.roll) * u;
    if (drift) {
      const { amp = 0.15, speed = 0.25, orbit = 0 } = drift;
      if (orbit) {
        const off = pos.clone().sub(target);
        off.applyAxisAngle(new THREE.Vector3(0, 1, 0), orbit * t);
        pos.copy(target).add(off);
      }
      pos.x += Math.sin(t * speed * 2.1) * amp;
      pos.y += Math.sin(t * speed * 1.3 + 1.7) * amp * 0.5;
      pos.z += Math.cos(t * speed * 1.7 + 0.4) * amp * 0.6;
    }
    return { pos, target, fov, roll, viewHeight };
  }

  function update(t) {
    const s = sample(t);
    const done = (r) => { camera.updateWorldMatrix(true, false); return r; }; // matrices current NOW (camera is not in the scene graph)
    camera.position.copy(s.pos);
    camera.userData.rigTarget = s.target; // pass 7: read by studio.depthOfField auto-focus (no effect on the picture)
    camera.up.set(0, 1, 0);
    camera.lookAt(s.target);
    if (s.roll) camera.rotateZ(s.roll);
    if (camera.isOrthographicCamera) {
      const vh = s.viewHeight ?? camera.userData.viewHeight ?? 2 * s.pos.distanceTo(s.target) * Math.tan(((s.fov ?? camera.fov ?? 35) * Math.PI) / 360);
      camera.fov = s.fov;
      const h = vh / 2, a = camera.aspect ?? (camera.right - camera.left) / (camera.top - camera.bottom);
      camera.left = -h * a; camera.right = h * a; camera.top = h; camera.bottom = -h;
      camera.updateProjectionMatrix();
    } else if (camera.fov !== s.fov) {
      camera.fov = s.fov;
      camera.updateProjectionMatrix();
    }
    return done(s);
  }

  return { keys: K, sample, update };
}
