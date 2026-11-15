#!/usr/bin/env python3
"""
build_scene_skeleton.py — 3d-style-atlas scene.spec.json  ->  Blender scene (bpy).

Companion to references/blender-translation.md. Target: Blender 5.3 (uses the 5.0+ API; 4.2-4.5
fallbacks are noted inline). Coordinate rules: three (x, y, z) -> Blender (x, -z, y).

STATUS
  * Pure-math section (top half): EXECUTED. `python3 build_scene_skeleton.py --selftest ref.json`
    checks the easing ports, the evalTrack->keyframe translation, the camera bake and the
    look-at -> rotation conversion against values dumped from the vendored three.js (r181) + kit.
  * bpy section (bottom half): UNEXECUTED. Blender was not installed on the authoring machine.
    API names were checked against the blender-v5.3-release source, but nothing here has run
    inside Blender. Run it on a tiny spec first and look at the frame.

USAGE
  node scripts/export-blender.mjs <project>          # Three side: writes <project>/export/ (see below)
  blender -b --factory-startup -P build_scene_skeleton.py -- <project>/export OUT_DIR \
          [--still FRAME] [--render] [--engine eevee|cycles]
  (a bare scene.spec.json path still works: primitives + track keys only, no bake/glb.)

INPUT: <project>/export/ as written by scripts/export-blender.mjs
  scene.spec.json   style + scene plain data                       (always)
  manifest.json     resolved renderer, lights (sunAngleDeg / sourceRadius), materials, textures, labels,
                    audio paths, reference frames
  bake.json         per-frame camera matrixWorld + fov, sparse node world matrices + visibility, lights,
                    material values, post params (three world space, column-major 4x4)
  geometry.glb      whole scene, node names = bake ids (glTF importer converts Y-up -> Z-up)
  textures/*.png    canvas textures + text labels;  refs/frame_NNNN.png  Three reference frames
  When bake.json + geometry.glb exist, the script imports the glb and keys every baked node/camera frame
  (exact by construction) instead of rebuilding primitives from tracks.
  Writes OUT_DIR/scene.blend, OUT_DIR/still_FFFF.png (--still) or OUT_DIR/frames/f_####.png (--render).
  Audio is NOT rendered here: mux afterwards with ffmpeg (command printed at the end).
"""
import json
import math
import os
import sys

# =====================================================================================
# PURE HELPERS (no bpy) — safe to import/run with plain python3
# =====================================================================================

TAU = math.pi * 2


def srgb_to_linear(c):
    """IEC 61966-2-1 sRGB EOTF for one channel in 0..1."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    """'#rrggbb' (sRGB) -> linear-sRGB/Rec.709 floats, which is what Blender color sockets expect."""
    h = str(h).lstrip("#")
    if len(h) == 3:
        h = "".join(ch * 2 for ch in h)
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


# ---- axes: three is Y-up, Blender is Z-up; both right-handed. C = Rx(+90deg). ----
def t2b(v):
    """Position / direction: (x, y, z)_three -> (x, -z, y)_blender."""
    return (v[0], -v[2], v[1])


def t2b_scale(s):
    """Scale of a mesh/empty (conjugation C*S*C^-1): (sx, sy, sz) -> (sx, sz, sy)."""
    if isinstance(s, (int, float)):
        return (float(s), float(s), float(s))
    return (s[0], s[2], s[1])


BLENDER_EULER_MODE = "YZX"


def t2b_euler(e):
    """three Euler order 'XYZ' (a, b, c) on a mesh/empty -> Blender rotation_mode 'YZX' value
    (a, -c, b). Exact (verified numerically), and per-channel, so euler animation curves
    transfer channel-for-channel with no resampling."""
    return (e[0], -e[2], e[1])


def t2b_quat_mesh(q_xyzw):
    """three Quaternion (x, y, z, w) on a mesh/empty -> Blender (w, x, y, z) = (w, x, -z, y)."""
    x, y, z, w = q_xyzw
    return (w, x, -z, y)


def fov_to_lens(fov_deg, sensor_h=24.0):
    """three PerspectiveCamera.fov is VERTICAL, in DEGREES. Use with sensor_fit='VERTICAL'."""
    return sensor_h / (2.0 * math.tan(math.radians(fov_deg) / 2.0))


def light_energy(kind, intensity):
    """three (r155+ physical units) -> Blender, 'Unitless' convention (glTF-Blender-IO COMPAT mode):
    directional lux -> sun W/m^2 1:1 ; point/spot candela -> W * 4*pi.  See doc section 4."""
    if kind == "directional":
        return float(intensity)
    if kind in ("point", "spot"):
        return float(intensity) * 4.0 * math.pi
    raise ValueError(kind)


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _norm(v):
    n = math.sqrt(sum(c * c for c in v))
    return tuple(c / n for c in v) if n > 1e-12 else (0.0, 0.0, 0.0)


def look_rotation_rows(pos_b, target_b, roll=0.0, up=(0.0, 0.0, 1.0)):
    """Rotation (3x3, row-major) for a Blender camera/light at pos_b looking at target_b.
    Same construction as three's Matrix4.lookAt (z = eye - target, x = up x z, y = z x x), done in
    Blender space with world up +Z, then three's camera.rotateZ(roll) = post-multiply Rz(roll).
    Equivalent to Vector(target-pos).to_track_quat('-Z', 'Y') when roll == 0."""
    z = _norm(tuple(p - t for p, t in zip(pos_b, target_b)))
    x = _cross(up, z)
    if math.sqrt(sum(c * c for c in x)) < 1e-9:  # looking straight up/down: three nudges z the same way
        z = _norm((z[0] + 1e-4, z[1], z[2]))
        x = _cross(up, z)
    x = _norm(x)
    y = _cross(z, x)
    cr, sr = math.cos(roll), math.sin(roll)
    xr = tuple(cr * a + sr * b for a, b in zip(x, y))
    yr = tuple(-sr * a + cr * b for a, b in zip(x, y))
    return [[xr[0], yr[0], z[0]], [xr[1], yr[1], z[1]], [xr[2], yr[2], z[2]]]


# ---- kit/time.js easings, ported 1:1 (used for baking) ----
def _c(t):
    return 0.0 if t < 0 else 1.0 if t > 1 else t


def _in_out_back(t, s=1.70158 * 1.525):
    t = _c(t)
    if t < 0.5:
        return ((2 * t) ** 2 * ((s + 1) * 2 * t - s)) / 2
    return ((2 * t - 2) ** 2 * ((s + 1) * (t * 2 - 2) + s) + 2) / 2


def _out_elastic(t):
    t = _c(t)
    if t in (0.0, 1.0):
        return t
    return 2 ** (-10 * t) * math.sin((t * 10 - 0.75) * (TAU / 3)) + 1


def _out_bounce(t):
    t = _c(t)
    n, d = 7.5625, 2.75
    if t < 1 / d:
        return n * t * t
    if t < 2 / d:
        t -= 1.5 / d
        return n * t * t + 0.75
    if t < 2.5 / d:
        t -= 2.25 / d
        return n * t * t + 0.9375
    t -= 2.625 / d
    return n * t * t + 0.984375


def _in_out_expo(t):
    t = _c(t)
    if t in (0.0, 1.0):
        return t
    return 2 ** (20 * t - 10) / 2 if t < 0.5 else (2 - 2 ** (-20 * t + 10)) / 2


EASE = {
    "linear": lambda t: _c(t),
    "inQuad": lambda t: _c(t) ** 2,
    "outQuad": lambda t: 1 - (1 - _c(t)) ** 2,
    "inOutQuad": lambda t: 2 * _c(t) ** 2 if _c(t) < 0.5 else 1 - (-2 * _c(t) + 2) ** 2 / 2,
    "inCubic": lambda t: _c(t) ** 3,
    "outCubic": lambda t: 1 - (1 - _c(t)) ** 3,
    "inOutCubic": lambda t: 4 * _c(t) ** 3 if _c(t) < 0.5 else 1 - (-2 * _c(t) + 2) ** 3 / 2,
    "inOutSine": lambda t: -(math.cos(math.pi * _c(t)) - 1) / 2,
    "outSine": lambda t: math.sin(_c(t) * math.pi / 2),
    "inExpo": lambda t: 0.0 if _c(t) == 0 else 2 ** (10 * _c(t) - 10),
    "outExpo": lambda t: 1.0 if _c(t) == 1 else 1 - 2 ** (-10 * _c(t)),
    "inOutExpo": _in_out_expo,
    "inBack": lambda t, s=1.70158: (s + 1) * _c(t) ** 3 - s * _c(t) ** 2,
    "outBack": lambda t, s=1.70158: 1 + (s + 1) * (_c(t) - 1) ** 3 + s * (_c(t) - 1) ** 2,
    "inOutBack": _in_out_back,
    "outElastic": _out_elastic,
    "outBounce": _out_bounce,
}


def ease_fn(name):
    return EASE.get(name or "inOutCubic", EASE["linear"])  # kit: unknown names fall back to linear


# ---- named easing -> Blender keyframe (interpolation, easing). Set on the key that STARTS the segment.
EASE_TO_BLENDER = {
    "linear": ("LINEAR", "AUTO"),
    "inQuad": ("QUAD", "EASE_IN"), "outQuad": ("QUAD", "EASE_OUT"), "inOutQuad": ("QUAD", "EASE_IN_OUT"),
    "inCubic": ("CUBIC", "EASE_IN"), "outCubic": ("CUBIC", "EASE_OUT"), "inOutCubic": ("CUBIC", "EASE_IN_OUT"),
    "outSine": ("SINE", "EASE_OUT"), "inOutSine": ("SINE", "EASE_IN_OUT"),
    "inExpo": ("EXPO", "EASE_IN"), "outExpo": ("EXPO", "EASE_OUT"), "inOutExpo": ("EXPO", "EASE_IN_OUT"),
    "inBack": ("BACK", "EASE_IN"), "outBack": ("BACK", "EASE_OUT"), "inOutBack": ("BACK", "EASE_IN_OUT"),
    "outBounce": ("BOUNCE", "EASE_OUT"),
    "outElastic": ("ELASTIC", "EASE_OUT"),  # needs amplitude=|change| and period=0.3*segment frames
}


# ---- Blender's own easing math (blenlib/intern/easing.cc, v5.3), for the self-test only ----
def _bl_eval(interp, easing, t, b, c, d, back=1.70158, amp=0.8, per=4.1):
    if interp == "CONSTANT" or d == 0:
        return b
    if interp == "LINEAR":
        return c * t / d + b
    e = easing
    if interp == "CUBIC":
        if e == "EASE_OUT":
            t = t / d - 1
            return c * (t * t * t + 1) + b
        if e == "EASE_IN_OUT":
            t /= d / 2
            if t < 1:
                return c / 2 * t * t * t + b
            t -= 2
            return c / 2 * (t * t * t + 2) + b
        t /= d
        return c * t * t * t + b
    if interp == "QUAD":
        if e == "EASE_OUT":
            t /= d
            return -c * t * (t - 2) + b
        if e == "EASE_IN_OUT":
            t /= d / 2
            if t < 1:
                return c / 2 * t * t + b
            t -= 1
            return -c / 2 * (t * (t - 2) - 1) + b
        t /= d
        return c * t * t + b
    if interp == "SINE":
        if e == "EASE_OUT":
            return c * math.sin(t / d * math.pi / 2) + b
        if e == "EASE_IN_OUT":
            return -c / 2 * (math.cos(math.pi * t / d) - 1) + b
        return -c * math.cos(t / d * math.pi / 2) + c + b
    if interp == "EXPO":
        pm, ps = 2 ** -10, 1 / (1 - 2 ** -10)

        def ein(t, b, c, d):
            return b if t == 0 else c * (2 ** (10 * (t / d - 1)) - pm) * ps + b

        def eout(t, b, c, d):
            return b if t == 0 else c * (1 - (2 ** (-10 * t / d) - pm) * ps) + b
        if e == "EASE_OUT":
            return eout(t, b, c, d)
        if e == "EASE_IN_OUT":
            return ein(t, b, c / 2, d / 2) if t <= d / 2 else eout(t - d / 2, b + c / 2, c / 2, d / 2)
        return ein(t, b, c, d)
    if interp == "BACK":
        s = back
        if e == "EASE_IN":
            t /= d
            return c * t * t * ((s + 1) * t - s) + b
        if e == "EASE_IN_OUT":
            s *= 1.525
            t /= d / 2
            if t < 1:
                return c / 2 * (t * t * ((s + 1) * t - s)) + b
            t -= 2
            return c / 2 * (t * t * ((s + 1) * t + s) + 2) + b
        t = t / d - 1
        return c * (t * t * ((s + 1) * t + s) + 1) + b
    if interp == "BOUNCE":  # EASE_OUT / AUTO
        t /= d
        if t < 1 / 2.75:
            return c * (7.5625 * t * t) + b
        if t < 2 / 2.75:
            t -= 1.5 / 2.75
            return c * (7.5625 * t * t + 0.75) + b
        if t < 2.5 / 2.75:
            t -= 2.25 / 2.75
            return c * (7.5625 * t * t + 0.9375) + b
        t -= 2.625 / 2.75
        return c * (7.5625 * t * t + 0.984375) + b
    if interp == "ELASTIC":  # EASE_OUT / AUTO
        if t == 0:
            return b
        t /= d
        if t == 1:
            return b + c
        t = -t
        if not per:
            per = d * 0.3
        f = 1.0
        if not amp or amp < abs(c):
            s = per / 4
            if c:
                f = f * amp / abs(c) if amp else 0.0
                if abs(t * d) < abs(s):
                    l = abs(t * d) / abs(s)
                    f = f * l + (1 - l)
            amp = c
        else:
            s = per / TAU * math.asin(c / amp)
        return f * (amp * 2 ** (10 * t) * math.sin((t * d - s) * TAU / per)) + c + b
    raise ValueError(interp)


# ---- kit/spec.js evalTrack semantics -> keyframes ----
def resolve_tracks(tracks, beats):
    by_id = {b["id"]: b for b in beats}
    out = []
    for a in tracks:
        b = by_id[a["beat"]] if a.get("beat") else {"t": 0.0, "dur": 0.0}
        start = (a["at"] if a.get("at") is not None else b["t"]) + (a.get("offset") or 0.0)
        dur = a["dur"] if a.get("dur") is not None else b.get("dur", 0.0)
        out.append(dict(a, start=start, dur=dur))
    out.sort(key=lambda x: x["start"])  # python sort is stable, like Array.prototype.sort
    return out


def _vec(v, n):
    if n == 0:
        return float(v)
    return list(v) if isinstance(v, (list, tuple)) else [float(v)] * n


def eval_track(tracks, beats, t, base):
    """Port of kit/spec.js evalTrack (base: number or list)."""
    ts = resolve_tracks(tracks, beats)
    cur, p = ts[0], 0.0
    for tr in ts:
        if t >= tr["start"]:
            cur = tr
    if t >= cur["start"]:
        p = ease_fn(cur.get("ease", "inOutCubic"))(_c((t - cur["start"]) / cur["dur"])) if cur["dur"] > 0 else 1.0
    n = 0 if isinstance(base, (int, float)) else len(base)
    f = _vec(cur.get("from", base) if cur.get("from") is not None else base, n)
    g = _vec(cur.get("to", base) if cur.get("to") is not None else base, n)
    if n == 0:
        return f + (g - f) * p
    return [x + (y - x) * p for x, y in zip(f, g)]


def tracks_to_keys(tracks, beats, base, fps, eps=1e-3):
    """Translate one property's tracks into keyframes: list of dicts
    {frame, value(list|float), interp, easing, ease}. Returns None when the tracks overlap
    (kit: the later track cuts in) or use an easing Blender cannot express -> caller bakes."""
    ts = resolve_tracks(tracks, beats)
    n = 0 if isinstance(base, (int, float)) else len(base)
    keys = []

    def put(frame, value, ease_name):
        if abs(frame - round(frame)) < 1e-6:  # 1.0333..*30 = 31.000000000000004 must land ON frame 31
            frame = float(round(frame))
        if keys and abs(keys[-1]["frame"] - frame) < 1e-9:
            same = keys[-1]["value"] == value
            if same:  # contiguous segment: one key carries the next segment's easing
                keys[-1]["ease"] = ease_name
                return
            keys[-1]["frame"] = frame - eps  # jump: old value up to just before, new value at frame
        keys.append({"frame": frame, "value": value, "ease": ease_name})

    for i, tr in enumerate(ts):
        if i and tr["start"] < ts[i - 1]["start"] + ts[i - 1]["dur"] - 1e-9:
            return None
        e = tr.get("ease", "inOutCubic")
        if tr["dur"] > 0 and e not in EASE_TO_BLENDER:
            return None
        f = _vec(tr["from"] if tr.get("from") is not None else base, n)
        g = _vec(tr["to"] if tr.get("to") is not None else base, n)
        f0, f1 = tr["start"] * fps, (tr["start"] + tr["dur"]) * fps
        if tr["dur"] > 0:
            put(f0, f, e)
            put(f1, g, "__hold__")
        else:
            put(f0 - eps, f, "__hold__")
            put(f0, g, "__hold__")
    for k in keys:
        if k["ease"] == "__hold__":
            k["interp"], k["easing"] = "CONSTANT", "AUTO"
        else:
            k["interp"], k["easing"] = EASE_TO_BLENDER[k["ease"]]
    if keys:
        keys[-1]["interp"] = "CONSTANT"
    return keys


def eval_keys(keys, frame, comp=None):
    """Evaluate keys the way Blender's F-curve does (constant extrapolation), for the self-test."""
    val = (lambda k: k["value"]) if comp is None else (lambda k: k["value"][comp])
    if frame <= keys[0]["frame"]:
        return val(keys[0])
    for a, b in zip(keys, keys[1:]):
        if a["frame"] <= frame < b["frame"]:
            d = b["frame"] - a["frame"]
            c = val(b) - val(a)
            amp, per = (abs(c), 0.3 * d) if a["interp"] == "ELASTIC" else (0.8, 4.1)
            return _bl_eval(a["interp"], a["easing"], frame - a["frame"], val(a), c, d, amp=amp, per=per)
    return val(keys[-1])


# ---- kit/camera.js rig.sample, ported (bake source for the Blender camera) ----
def camera_sample(keys, t, default_fov=35.0, drift=None):
    K = sorted(
        ({"t": k["t"], "pos": list(k["pos"]), "target": list(k.get("target") or [0, 0, 0]),
          "fov": k.get("fov") if k.get("fov") is not None else default_fov,
          "roll": k.get("roll") or 0.0, "ease": k.get("ease") or "inOutCubic"} for k in keys),
        key=lambda k: k["t"])
    a = b = K[0]
    u = 0.0
    if t >= K[-1]["t"]:
        a = b = K[-1]
    elif t > K[0]["t"]:
        for i in range(len(K) - 1):
            if K[i]["t"] <= t < K[i + 1]["t"]:
                a, b = K[i], K[i + 1]
                u = ease_fn(b["ease"])(_c((t - a["t"]) / (b["t"] - a["t"])))  # ease of the ARRIVING key
                break
    lerp = lambda x, y: [p + (q - p) * u for p, q in zip(x, y)]
    pos, target = lerp(a["pos"], b["pos"]), lerp(a["target"], b["target"])
    fov = a["fov"] + (b["fov"] - a["fov"]) * u
    roll = a["roll"] + (b["roll"] - a["roll"]) * u
    if drift:
        amp, speed, orbit = drift.get("amp", 0.15), drift.get("speed", 0.25), drift.get("orbit", 0.0)
        if orbit:  # rotate (pos - target) about three +Y by orbit*t
            ox, oy, oz = (p - q for p, q in zip(pos, target))
            ang = orbit * t
            ca, sa = math.cos(ang), math.sin(ang)
            pos = [target[0] + ox * ca + oz * sa, target[1] + oy, target[2] - ox * sa + oz * ca]
        pos[0] += math.sin(t * speed * 2.1) * amp
        pos[1] += math.sin(t * speed * 1.3 + 1.7) * amp * 0.5
        pos[2] += math.cos(t * speed * 1.7 + 0.4) * amp * 0.6
    return {"pos": pos, "target": target, "fov": fov, "roll": roll}


# ---- three.js geometry generators that Blender has no exact primitive for (three coords) ----
ICO_T = (1 + 5 ** 0.5) / 2
ICO_V = [(-1, ICO_T, 0), (1, ICO_T, 0), (-1, -ICO_T, 0), (1, -ICO_T, 0), (0, -1, ICO_T), (0, 1, ICO_T),
         (0, -1, -ICO_T), (0, 1, -ICO_T), (ICO_T, 0, -1), (ICO_T, 0, 1), (-ICO_T, 0, -1), (-ICO_T, 0, 1)]
ICO_F = [(0, 11, 5), (0, 5, 1), (0, 1, 7), (0, 7, 10), (0, 10, 11), (1, 5, 9), (5, 11, 4), (11, 10, 2),
         (10, 7, 6), (7, 1, 8), (3, 9, 4), (3, 4, 2), (3, 2, 6), (3, 6, 8), (3, 8, 9), (4, 9, 5), (2, 4, 11),
         (6, 2, 10), (8, 6, 7), (9, 8, 1)]  # == three IcosahedronGeometry(1, 0) (verified, same winding)


def gen_icosahedron(r):
    n = math.hypot(1, ICO_T)
    return [tuple(c / n * r for c in v) for v in ICO_V], list(ICO_F)


def gen_torus(R, r, radial=24, tubular=64, arc=TAU):
    """three TorusGeometry(radius, tube, radialSegments, tubularSegments): ring in three's XY plane."""
    closed = abs(arc - TAU) < 1e-9
    nu = tubular if closed else tubular + 1
    verts = []
    for j in range(radial):
        v = j / radial * TAU
        for i in range(nu):
            u = i / tubular * arc
            verts.append(((R + r * math.cos(v)) * math.cos(u), (R + r * math.cos(v)) * math.sin(u), r * math.sin(v)))
    idx = lambda j, i: (j % radial) * nu + (i % nu)
    faces = [(idx(j, i), idx(j - 1, i), idx(j - 1, i + 1), idx(j, i + 1))
             for j in range(1, radial + 1) for i in range(tubular)]
    return verts, faces


def gen_plane(w, h):
    """three PlaneGeometry: XY plane, normal +Z. Returns verts, faces, uvs (per face-corner)."""
    v = [(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)]
    return v, [(0, 1, 2, 3)], [[(0, 0), (1, 0), (1, 1), (0, 1)]]


def gen_capsule(r, length, cap_seg=8, radial=24):
    """Capsule along three +Y: hemispheres of radius r joined by a cylinder of height `length`."""
    rings = []
    for k in range(1, cap_seg + 1):  # top hemisphere, pole excluded
        th = k / cap_seg * math.pi / 2
        rings.append((length / 2 + r * math.cos(th), r * math.sin(th)))
    for k in range(0, cap_seg):  # bottom hemisphere, starts at the equator
        th = math.pi / 2 + k / cap_seg * math.pi / 2
        rings.append((-length / 2 + r * math.cos(th), r * math.sin(th)))
    verts = [(0, length / 2 + r, 0)]
    for y, rad in rings:
        for i in range(radial):
            a = i / radial * TAU
            verts.append((rad * math.sin(a), y, rad * math.cos(a)))
    verts.append((0, -length / 2 - r, 0))
    last = len(verts) - 1
    faces = [(0, 1 + (i + 1) % radial, 1 + i) for i in range(radial)]
    for k in range(len(rings) - 1):
        a0, b0 = 1 + k * radial, 1 + (k + 1) * radial
        faces += [(a0 + i, a0 + (i + 1) % radial, b0 + (i + 1) % radial, b0 + i) for i in range(radial)]
    b0 = 1 + (len(rings) - 1) * radial
    faces += [(last, b0 + i, b0 + (i + 1) % radial) for i in range(radial)]
    return verts, faces  # winding is normalised later with recalc_face_normals


def gen_cyclorama(width=40, depth=20, height=14, radius=5, segments=24):
    """Port of kit/builders.js createCyclorama (three coords)."""
    zb, zf = -depth / 2, depth / 2
    pts = [(zf, 0.0)]
    for i in range(segments + 1):
        a = i / segments * math.pi / 2
        pts.append((zb + radius - math.sin(a) * radius, radius - math.cos(a) * radius))
    pts.append((zb, height))
    verts = []
    for z, y in pts:
        for x in (-width / 2, width / 2):
            verts.append((x, y, z))
    faces = [(i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1) for i in range(len(pts) - 1)]
    return verts, faces


# =====================================================================================
# SELF-TEST (plain python3)
# =====================================================================================
def _keys_vs_track(names, label, note):
    import random
    rnd = random.Random(7)
    for trial in range(400):  # random track sets -> keys -> Blender evaluation vs evalTrack
        beats = [{"id": "b%d" % i, "t": i * 1.5, "dur": 1.0 + rnd.random()} for i in range(4)]
        tracks, t0 = [], 0.0
        for _ in range(rnd.randint(1, 3)):
            t0 += rnd.random() * 1.2
            dur = rnd.choice([0.0, 0.4 + rnd.random()])
            tr = {"at": round(t0 * 30) / 30, "dur": dur, "ease": rnd.choice(names)}
            if rnd.random() < 0.8:
                tr["from"] = [rnd.uniform(-3, 3) for _ in range(3)]
            if rnd.random() < 0.9:
                tr["to"] = [rnd.uniform(-3, 3) for _ in range(3)]
            tracks.append(tr)
            t0 += dur
        if rnd.random() < 0.3:
            tracks.append({"beat": "b2", "to": [1, 2, 3], "ease": rnd.choice(names)})
        base = [0.5, -0.25, 2.0]
        keys = tracks_to_keys(tracks, beats, base, 30)
        if keys is None:
            continue
        for fr in range(0, 300):
            want = eval_track(tracks, beats, fr / 30, base)
            for c in range(3):
                d = abs(eval_keys(keys, fr, c) - want[c])
                note(label, d)


def selftest(ref_path):
    """ref.json is produced by the Node snippet in blender-translation.md, Appendix A."""
    mw = matrix_selftest()
    print(f"bake matrix C.M.C^-1 vs t2b(M.p): max error {mw:.2e}")
    if mw > 1e-9:
        return False
    ref = json.load(open(ref_path))
    worst = {}

    def note(k, d):
        worst[k] = max(worst.get(k, 0.0), d)

    for name, vals in ref["ease"].items():
        if name not in EASE:
            print("  (kit ease not ported:", name, ")")
            continue
        for i, v in enumerate(vals):
            note("ease port vs kit", abs(EASE[name](i / 100) - v))
    for label, names in (("keys(Blender eval) vs evalTrack, integer frames", [n for n in EASE_TO_BLENDER if "Expo" not in n]),
                         ("  same, Expo only (Blender renormalises 2^-10t: abs err <= 9.8e-4*|change|)", ["inExpo", "outExpo", "inOutExpo", "linear"])):
        _keys_vs_track(names, label, note)
    C = [[1, 0, 0], [0, 0, -1], [0, 1, 0]]  # three -> Blender basis change, Rx(+90deg)
    cam = ref["cam"]
    for s in cam["samples"]:
        mine = camera_sample(cam["keys"], s["t"], 35.0, cam["drift"])
        note("camera pos", max(abs(a - b) for a, b in zip(mine["pos"], s["pos"])))
        note("camera fov", abs(mine["fov"] - s["fov"]))
        x, y, z, w = s["quat"]
        R3 = [[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
              [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
              [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]]
        want = [[sum(C[i][k] * R3[k][j] for k in range(3)) for j in range(3)] for i in range(3)]
        got = look_rotation_rows(t2b(mine["pos"]), t2b(mine["target"]), mine["roll"])
        note("camera rotation (Blender) vs C*R_three", max(abs(got[i][j] - want[i][j]) for i in range(3) for j in range(3)))
    note("hex #808080 -> 0.21586", abs(hex_to_linear("#808080")[0] - 0.21586050011389926))
    note("fov 35 -> 38.0591 mm", abs(fov_to_lens(35) - 38.05912) / 38)
    ok = True
    for k, d in worst.items():
        tol = 6e-3 if "Expo only" in k else 1e-6  # expo: |change| <= 6 here, 6 * 9.77e-4
        flag = "ok " if d < tol else "BAD"
        ok &= d < tol
        print(f"  [{flag}] {k:58s} max err {d:.2e}")
    print("SELFTEST", "PASSED" if ok else "FAILED")
    return ok


# ---- export/ folder inputs (pure; EXECUTED in --selftest via matrix_selftest) ----
def load_export(path):
    """path = <project>/export (dir) or a scene.spec.json. Returns dict with spec, manifest, bake, glb, dir."""
    d = path if os.path.isdir(path) else os.path.dirname(os.path.abspath(path))
    spec_path = os.path.join(d, "scene.spec.json") if os.path.isdir(path) else path
    j = lambda f: json.load(open(os.path.join(d, f))) if os.path.exists(os.path.join(d, f)) else None
    glb = os.path.join(d, "geometry.glb")
    return {"dir": d, "spec": json.load(open(spec_path)), "manifest": j("manifest.json"), "bake": j("bake.json"),
            "glb": glb if os.path.exists(glb) else None}


def m16_rows(e):
    """three Matrix4.elements (column-major 16) -> 4x4 row lists."""
    return [[e[c * 4 + r] for c in range(4)] for r in range(4)]


_C = [[1, 0, 0, 0], [0, 0, -1, 0], [0, 1, 0, 0], [0, 0, 0, 1]]  # Rx(+90): three -> blender
_CI = [[1, 0, 0, 0], [0, 0, 1, 0], [0, -1, 0, 0], [0, 0, 0, 1]]


def _mm(a, b):
    return [[sum(a[i][k] * b[k][j] for k in range(4)) for j in range(4)] for i in range(4)]


def bake_matrix_to_blender(e, kind="node"):
    """Baked three world matrix -> Blender matrix_world rows.
    node (mesh/empty, geometry converted by the glTF importer): C . M . C^-1
    camera / light (share three's local frame: look down -Z, +Y up):  C . M"""
    m = m16_rows(e)
    return _mm(_C, m) if kind in ("camera", "light") else _mm(_mm(_C, m), _CI)


def sparse_at(keys, frame):
    """Value of a sparse [[frame, value], ...] channel at `frame` (holds the last key <= frame)."""
    v = keys[0][1] if keys else None
    for f, val in keys:
        if f > frame:
            break
        v = val
    return v


def matrix_selftest():
    """C.M.C^-1 applied to a point == t2b(M . p) for meshes; checked on a random affine matrix."""
    import random
    rnd = random.Random(3)
    worst = 0.0
    for _ in range(50):
        e = [rnd.uniform(-2, 2) for _ in range(16)]
        e[3] = e[7] = e[11] = 0.0
        e[15] = 1.0
        p = [rnd.uniform(-3, 3) for _ in range(3)]
        m = m16_rows(e)
        mp = [sum(m[r][k] * (p + [1])[k] for k in range(4)) for r in range(3)]
        b = bake_matrix_to_blender(e)
        pb = t2b(p)
        bp = [sum(b[r][k] * (list(pb) + [1])[k] for k in range(4)) for r in range(3)]
        worst = max(worst, max(abs(x - y) for x, y in zip(bp, t2b(mp))))
    return worst


# =====================================================================================
# BPY SECTION — UNEXECUTED (see STATUS)
# =====================================================================================
VIEW_TRANSFORM = {"none": "Standard", "aces": "ACES 1.3", "agx": "AgX", "neutral": "Khronos PBR Neutral"}


def _bpy():
    import bpy  # noqa: F401
    import bmesh  # noqa: F401
    import mathutils  # noqa: F401
    return bpy, bmesh, mathutils


def set_input(node, name, value):
    sock = node.inputs.get(name)
    if sock is None:
        print(f"[warn] {node.bl_idname} has no input '{name}' in this Blender version")
        return None
    sock.default_value = value
    return sock


def sock_id(coll, identifier):
    """Socket by identifier (names repeat on multi-type nodes such as ShaderNodeMix: 'A' x5)."""
    return next(sk for sk in coll if sk.identifier == identifier)


def channelbag_fcurves(owner_id):
    """F-curve collection for owner_id's assigned action: 5.x layered actions (channelbag), with a
    fallback to the legacy Action.fcurves (<= 4.3)."""
    ad = owner_id.animation_data
    act = ad.action
    try:
        from bpy_extras.anim_utils import action_ensure_channelbag_for_slot  # 4.4+
        return action_ensure_channelbag_for_slot(act, ad.action_slot).fcurves
    except ImportError:
        return act.fcurves


def insert_track_keys(owner_id, target, data_path, keys, ncomp, convert=lambda v: v):
    """Insert keys produced by tracks_to_keys(). `target` is the struct owning data_path (object,
    node socket...), `owner_id` the ID that carries the animation (object, material.node_tree...)."""
    full_path = target.path_from_id(data_path) if target != owner_id else data_path
    first = keys[0]
    setattr(target, data_path, convert(first["value"]))
    target.keyframe_insert(data_path, frame=first["frame"])  # creates action + slot + channelbag
    fcs = channelbag_fcurves(owner_id)
    idxs = range(ncomp) if ncomp else [0]
    for i in idxs:
        fc = fcs.find(full_path, index=i) if ncomp else fcs.find(full_path)
        if fc is None:
            fc = fcs.new(full_path, index=i)
        fc.keyframe_points.clear()
        for k, nxt in zip(keys, keys[1:] + [None]):
            v = convert(k["value"])
            kp = fc.keyframe_points.insert(k["frame"], v[i] if ncomp else v, options={"FAST"})
            kp.interpolation = k["interp"]
            kp.easing = k["easing"]
            if k["interp"] == "BACK":
                kp.back = 1.70158
            if k["interp"] == "ELASTIC" and nxt is not None:
                nv = convert(nxt["value"])
                kp.amplitude = abs((nv[i] if ncomp else nv) - (v[i] if ncomp else v))
                kp.period = 0.3 * (nxt["frame"] - k["frame"])
        fc.update()


def bake_track(owner_id, target, data_path, tracks, beats, base, fps, f0, f1, ncomp, convert):
    for fr in range(f0, f1 + 1):
        setattr(target, data_path, convert(eval_track(tracks, beats, fr / fps, base)))
        target.keyframe_insert(data_path, frame=fr)  # interpolation comes from the LINEAR preference


def make_material(name, m):
    bpy, _, _ = _bpy()
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True  # deprecated (always on) in 5.x; required in 4.x
    except Exception:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    kind = m.get("type") or ("physical" if (m.get("clearcoat") or m.get("transmission")) else "standard")
    if kind == "basic":  # unlit: Emission strength 1 shows the color exactly (Standard view)
        em = nt.nodes.new("ShaderNodeEmission")
        set_input(em, "Color", (*hex_to_linear(m.get("baseColor", "#cccccc")), 1.0))
        set_input(em, "Strength", 1.0)
        nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
        return mat
    if kind == "toon":
        print(f"[warn] material {name}: toon -> Principled fallback (see doc 3.7 for the EEVEE Shader-to-RGB recipe)")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    nt.links.new(b.outputs["BSDF"], out.inputs["Surface"])
    set_input(b, "Base Color", (*hex_to_linear(m.get("baseColor", "#cccccc")), 1.0))
    set_input(b, "Roughness", m.get("roughness", 0.6 if kind != "lambert" else 1.0))
    set_input(b, "Metallic", m.get("metalness", 0.0))
    set_input(b, "IOR", m.get("ior", 1.5))  # three Standard: F0 = 0.04 <=> IOR 1.5
    if kind == "lambert":
        set_input(b, "Specular IOR Level", 0.0)
    if m.get("emission"):
        set_input(b, "Emission Color", (*hex_to_linear(m["emission"]["color"]), 1.0))
        set_input(b, "Emission Strength", m["emission"].get("strength", 1.0))
    if m.get("clearcoat"):
        set_input(b, "Coat Weight", m["clearcoat"])
        set_input(b, "Coat Roughness", m.get("clearcoatRoughness", 0.0))
        set_input(b, "Coat IOR", 1.5)
    if m.get("transmission"):
        set_input(b, "Transmission Weight", m["transmission"])
    if m.get("sheen"):
        set_input(b, "Sheen Weight", m["sheen"])
    if m.get("opacity", 1.0) < 1.0:
        set_input(b, "Alpha", m["opacity"])
        mat.surface_render_method = "BLENDED"  # 4.2+ (EEVEE); Cycles ignores it
    if m.get("bump"):  # APPROXIMATE: Blender noise != kit fbm value noise (bake a PNG for an exact match)
        tc = nt.nodes.new("ShaderNodeTexCoord")
        nz = nt.nodes.new("ShaderNodeTexNoise")
        bp = nt.nodes.new("ShaderNodeBump")
        nt.links.new(tc.outputs["Object"], nz.inputs["Vector"])
        set_input(nz, "Scale", float(m["bump"].get("scale", 24)))
        set_input(nz, "Detail", float(max(0, m["bump"].get("octaves", 3) - 1)))
        nt.links.new(nz.outputs["Fac"], bp.inputs["Height"])
        set_input(bp, "Strength", min(1.0, 0.25 * m["bump"].get("strength", 1.0)))  # calibrate by eye
        set_input(bp, "Distance", 0.01)
        nt.links.new(bp.outputs["Normal"], b.inputs["Normal"])
    mat.use_backface_culling = m.get("side") != "double"
    return mat


def build_mesh(name, o, mats):
    """Returns (object, geometry_is_three_space_flat_floor) for one spec object."""
    bpy, bmesh, mathutils = _bpy()
    prim, d = o.get("primitive"), o.get("dims") or {}
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()

    def from_three(verts, faces):
        vs = [bm.verts.new(t2b(v)) for v in verts]
        for f in faces:
            bm.faces.new([vs[i] for i in f])

    if prim == "box":
        bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
        bmesh.ops.scale(bm, vec=(d.get("w", 1), d.get("d", 1), d.get("h", 1)), verts=bm.verts)
    elif prim == "roundedBox":
        bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
        bmesh.ops.scale(bm, vec=(d.get("w", 1), d.get("d", 1), d.get("h", 1)), verts=bm.verts)
    elif prim == "sphere":
        seg = d.get("segments", 48)
        bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=round(seg * 0.66), radius=d.get("r", 0.5), calc_uvs=True)
    elif prim in ("cylinder", "cone"):
        seg = d.get("segments", 48)
        r = d.get("r", 0.5)
        rt, rb = (d.get("rTop", r), d.get("rBottom", r)) if prim == "cylinder" else (0.0, r)
        bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=rb, radius2=rt,
                              depth=d.get("h", 1), calc_uvs=True)
        if seg % 2:  # three starts its ring at +Z(three) = -Y(Blender); bmesh starts at +Y
            bmesh.ops.rotate(bm, cent=(0, 0, 0), matrix=mathutils.Matrix.Rotation(math.pi, 3, "Z"), verts=bm.verts)
    elif prim == "torus":
        from_three(*gen_torus(d.get("r", 0.5), d.get("tube", 0.15), 24, d.get("segments", 64)))
    elif prim == "capsule":
        from_three(*gen_capsule(d.get("r", 0.3), d.get("length", 1.0), 8, 24))
    elif prim == "icosahedron":
        if d.get("detail", 0):
            print(f"[warn] {name}: icosahedron detail>0 approximated with create_icosphere")
            bmesh.ops.create_icosphere(bm, subdivisions=d["detail"] + 1, radius=d.get("r", 0.5))
        else:
            from_three(*gen_icosahedron(d.get("r", 0.5)))
    elif prim == "plane":
        v, f, _ = gen_plane(d.get("w", 1), d.get("h", 1))
        from_three(v, f)
    elif prim == "ground":
        s = d.get("size", 40)
        if o.get("rotation"):  # kit: a spec rotation REPLACES the builder's -pi/2, so geometry is the raw XY plane
            from_three(*gen_plane(s, s)[:2])
        else:  # floor geometry directly (builder rotation baked in)
            from_three([(-s / 2, 0, s / 2), (s / 2, 0, s / 2), (s / 2, 0, -s / 2), (-s / 2, 0, -s / 2)], [(0, 1, 2, 3)])
    elif prim == "cyclorama":
        from_three(*gen_cyclorama(**{k: d[k] for k in ("width", "depth", "height", "radius", "segments") if k in d}))
    else:
        print(f"[warn] {name}: primitive '{prim}' not handled (procedural: {o.get('procedural')!r}) -> placeholder cube; import glTF instead")
        bmesh.ops.create_cube(bm, size=0.2)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    obj = bpy.data.objects.new(name, me)
    if prim == "roundedBox":
        bev = obj.modifiers.new("Rounded", "BEVEL")
        bev.width = d.get("radius", 0.08)
        bev.segments = d.get("segments", 4)
        bev.limit_method = "NONE"
    mat_spec = o.get("material")
    if mat_spec and mat_spec in mats:
        me.materials.append(mats[mat_spec])
    flat = mat_spec and mats.get(mat_spec) is not None and mats[mat_spec].get("atlas_flat")
    me.shade_flat() if flat else me.shade_smooth()
    obj.visible_shadow = o.get("castShadow", True)
    return obj


def build_world(scn, style):
    """Hemisphere + ambient (diffuse-equivalent, see doc 4.4) for lighting; flat background colour for
    camera rays (three's scene.background does not light the scene)."""
    bpy, _, _ = _bpy()
    w = bpy.data.worlds.new("World")
    scn.world = w
    try:
        w.use_nodes = True
    except Exception:
        pass
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    light_shader = None
    for L in style.get("lights", []):
        if L["type"] not in ("hemisphere", "ambient"):
            continue
        I = L.get("intensity", 1.0) / math.pi
        bg = nt.nodes.new("ShaderNodeBackground")
        set_input(bg, "Strength", I)
        if L["type"] == "ambient":
            set_input(bg, "Color", (*hex_to_linear(L["color"]), 1.0))
        else:
            tc = nt.nodes.new("ShaderNodeTexCoord")
            sep = nt.nodes.new("ShaderNodeSeparateXYZ")
            mr = nt.nodes.new("ShaderNodeMapRange")
            mr.clamp = False
            set_input(mr, "From Min", -1.0)
            set_input(mr, "From Max", 1.0)
            set_input(mr, "To Min", -0.25)  # 1.5x steeper than the irradiance lerp: exact diffuse match
            set_input(mr, "To Max", 1.25)
            mix = nt.nodes.new("ShaderNodeMix")
            mix.data_type = "RGBA"
            mix.clamp_factor = False
            mix.clamp_result = True  # avoids negative radiance on high-contrast sky/ground pairs
            sock_id(mix.inputs, "A_Color").default_value = (*hex_to_linear(L.get("groundColor", "#444444")), 1.0)
            sock_id(mix.inputs, "B_Color").default_value = (*hex_to_linear(L["color"]), 1.0)
            nt.links.new(tc.outputs["Generated"], sep.inputs["Vector"])
            nt.links.new(sep.outputs["Z"], mr.inputs["Value"])
            nt.links.new(mr.outputs["Result"], sock_id(mix.inputs, "Factor_Float"))
            nt.links.new(sock_id(mix.outputs, "Result_Color"), bg.inputs["Color"])
        if light_shader is None:
            light_shader = bg.outputs["Background"]
        else:
            add = nt.nodes.new("ShaderNodeAddShader")
            nt.links.new(light_shader, add.inputs[0])
            nt.links.new(bg.outputs["Background"], add.inputs[1])
            light_shader = add.outputs["Shader"]
    env_hdr = style.get("world", {}).get("environmentHdr")  # PROPOSED field: equirect exported from three
    if env_hdr:
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = bpy.data.images.load(env_hdr)
        bge = nt.nodes.new("ShaderNodeBackground")
        set_input(bge, "Strength", style["world"].get("environmentIntensity", 1.0))
        nt.links.new(env.outputs["Color"], bge.inputs["Color"])
        if light_shader is None:
            light_shader = bge.outputs["Background"]
        else:
            add = nt.nodes.new("ShaderNodeAddShader")
            nt.links.new(light_shader, add.inputs[0])
            nt.links.new(bge.outputs["Background"], add.inputs[1])
            light_shader = add.outputs["Shader"]
    elif style.get("world", {}).get("environment") == "room":
        print("[warn] world.environment='room' has no Blender equivalent without an exported HDR (doc 4.6)")
    if light_shader is None:
        blk = nt.nodes.new("ShaderNodeBackground")
        set_input(blk, "Strength", 0.0)
        light_shader = blk.outputs["Background"]
    cam_bg = nt.nodes.new("ShaderNodeBackground")
    set_input(cam_bg, "Color", (*hex_to_linear(style.get("world", {}).get("background") or "#000000"), 1.0))
    set_input(cam_bg, "Strength", 1.0)
    lp = nt.nodes.new("ShaderNodeLightPath")
    ms = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(lp.outputs["Is Camera Ray"], ms.inputs["Fac"])
    nt.links.new(light_shader, ms.inputs[1])
    nt.links.new(cam_bg.outputs["Background"], ms.inputs[2])
    nt.links.new(ms.outputs["Shader"], out.inputs["Surface"])


def build_light(scn, L):
    bpy, _, mathutils = _bpy()
    kind = L["type"]
    btype = {"directional": "SUN", "point": "POINT", "spot": "SPOT"}[kind]
    data = bpy.data.lights.new(L.get("id", kind), type=btype)
    data.color = hex_to_linear(L.get("color", "#ffffff"))
    data.energy = light_energy(kind, L.get("intensity", 1.0))
    data.use_shadow = bool(L.get("shadow"))
    if btype == "SUN":
        data.angle = math.radians(L.get("sunAngleDeg", 2.0))  # PROPOSED field; 2 deg is a guess (doc 4.5)
    else:
        data.shadow_soft_size = L.get("radius", 0.0)  # three point/spot lights are true points
        if hasattr(data, "use_soft_falloff"):
            data.use_soft_falloff = False
    if btype == "SPOT":
        data.spot_size = 2.0 * L.get("angle", math.pi / 6)  # three angle is the HALF angle
        data.spot_blend = L.get("penumbra", 0.3)  # glTF-IO convention; falloff curve differs (doc 4.3)
    obj = bpy.data.objects.new(L.get("id", kind), data)
    scn.collection.objects.link(obj)
    pos = t2b(L.get("position", [0, 1, 0]))
    obj.location = pos
    if btype in ("SUN", "SPOT"):
        obj.rotation_mode = "QUATERNION"
        obj.rotation_quaternion = mathutils.Matrix(look_rotation_rows(pos, t2b(L.get("target", [0, 0, 0])))).to_quaternion()
    return obj


def apply_export_bake(scn, ex, f_start, f_end):
    """Import geometry.glb (node names = bake ids) and key every baked node per frame (LINEAR)."""
    bpy, _, mathutils = _bpy()
    bpy.ops.import_scene.gltf(filepath=ex["glb"])
    bake = ex["bake"]
    by_name = {o.name: o for o in bpy.data.objects}
    missing = 0
    for nid, ch in bake["nodes"].items():
        ob = by_name.get(nid)
        if ob is None:
            missing += 1
            continue
        kind = "light" if ob.type == "LIGHT" else "camera" if ob.type == "CAMERA" else "node"
        frames = sorted({f for f, _ in ch["keys"]} | {f for f, _ in ch["vis"]} | {f_start})
        for fr in frames:
            m = sparse_at(ch["keys"], fr)
            if m is not None:
                ob.matrix_world = mathutils.Matrix(bake_matrix_to_blender(m, kind))
                ob.keyframe_insert("location", frame=fr)
                ob.keyframe_insert("rotation_quaternion" if ob.rotation_mode == "QUATERNION" else "rotation_euler", frame=fr)
                ob.keyframe_insert("scale", frame=fr)
            v = sparse_at(ch["vis"], fr)
            if v is not None:
                ob.hide_render = not v
                ob.keyframe_insert("hide_render", frame=fr)
    if bake.get("deforming"):
        print(f"[warn] vertex-animated meshes are NOT baked (static glb shape): {bake['deforming'][:8]}")
    print(f"[info] baked {len(bake['nodes']) - missing} nodes from bake.json ({missing} ids not found in the glb)")


def bake_camera(scn, bake, f_start, f_end):
    """Camera from bake.json: matrixWorld (C . M) + vertical fov per frame."""
    bpy, _, mathutils = _bpy()
    cd = bpy.data.cameras.new("Camera")
    cd.sensor_fit, cd.sensor_height = "VERTICAL", 24.0
    cd.clip_start, cd.clip_end = bake["camera"]["near"], bake["camera"]["far"]
    cam = bpy.data.objects.new("Camera", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cam.rotation_mode = "QUATERNION"
    prev = None
    for fr in range(f_start, min(f_end, len(bake["camera"]["matrixWorld"]) - 1) + 1):
        M = mathutils.Matrix(bake_matrix_to_blender(bake["camera"]["matrixWorld"][fr], "camera"))
        loc, q, _ = M.decompose()
        if prev is not None:
            q.make_compatible(prev)
        prev = q
        cam.location, cam.rotation_quaternion = loc, q
        cd.lens = fov_to_lens(bake["camera"]["fovDeg"][fr], cd.sensor_height)
        cam.keyframe_insert("location", frame=fr)
        cam.keyframe_insert("rotation_quaternion", frame=fr)
        cd.keyframe_insert("lens", frame=fr)


def main(argv):
    bpy, bmesh, mathutils = _bpy()
    in_path, out_dir = argv[0], argv[1]
    opt = lambda k, d=None: argv[argv.index(k) + 1] if k in argv else d
    ex = load_export(in_path)
    spec = ex["spec"]
    style, sc = spec["style"], spec["scene"]
    os.makedirs(out_dir, exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.preferences.edit.keyframe_new_interpolation_type = "LINEAR"
    scn = bpy.context.scene
    fps = int(sc.get("fps", 30))
    res = sc.get("resolution", [1920, 1080])
    f_start, f_end = 0, int(round(sc["duration"] * fps)) - 1

    # ---- render settings ----
    engine = opt("--engine", "eevee")
    if engine == "cycles":
        scn.render.engine = "CYCLES"
        scn.cycles.samples = 128
    else:
        for eid in ("BLENDER_EEVEE", "BLENDER_EEVEE_NEXT"):  # 5.0+ / 4.2-4.5
            try:
                scn.render.engine = eid
                break
            except TypeError:
                continue
        scn.eevee.taa_render_samples = 64
        scn.eevee.use_raytracing = False  # three has no SSR/SSGI; keep the look comparable
    scn.render.resolution_x, scn.render.resolution_y = res
    scn.render.resolution_percentage = 100
    scn.render.fps, scn.render.fps_base = fps, 1.0
    scn.frame_start, scn.frame_end = f_start, f_end
    scn.render.film_transparent = False
    scn.render.dither_intensity = 0.0  # three adds no dither noise
    if hasattr(scn.render.image_settings, "media_type"):
        scn.render.image_settings.media_type = "IMAGE"  # 5.0+: must precede file_format
    scn.render.image_settings.file_format = "PNG"
    scn.render.image_settings.color_mode = "RGB"
    scn.render.image_settings.color_depth = "8"

    # ---- colour management ----
    world = style.get("world", {})
    tm = world.get("toneMapping", "aces")  # kit default when unset
    exposure = world.get("exposure", 1.0)
    scn.display_settings.display_device = "sRGB"
    try:
        scn.view_settings.view_transform = VIEW_TRANSFORM[tm]
    except TypeError:
        print(f"[warn] view transform {VIEW_TRANSFORM[tm]!r} unavailable in this Blender; using AgX")
        scn.view_settings.view_transform = "AgX"
    scn.view_settings.look = "None"
    scn.view_settings.gamma = 1.0
    scn.view_settings.exposure = math.log2(exposure / (0.6 if tm == "aces" else 1.0))  # three ACES pre-scales by 1/0.6

    build_world(scn, style)
    mats = {}
    for name, m in (style.get("materials") or {}).items():
        mats[name] = make_material(name, m)
        mats[name]["atlas_flat"] = bool(m.get("flatShading"))
    for L in style.get("lights", []):
        if L["type"] in ("directional", "point", "spot"):
            build_light(scn, L)

    # ---- objects ----
    beats = sc.get("beats", [])
    objs = {}
    if ex["glb"] and ex["bake"]:
        apply_export_bake(scn, ex, f_start, f_end)
        sc = dict(sc, objects=[])  # geometry + motion come from glb + bake; skip the primitive rebuild
    for o in sc.get("objects", []):
        oid = o["id"]
        if o.get("primitive") == "text":
            print(f"[warn] {oid}: text label -> needs the exported canvas PNG (doc 10, field texturePng); skipped")
            continue
        obj = build_mesh(oid, o, mats)
        scn.collection.objects.link(obj)
        if o.get("parent") in objs:
            obj.parent = objs[o["parent"]]  # matrix_parent_inverse stays identity = three semantics
        obj.rotation_mode = BLENDER_EULER_MODE
        base = {"position": list(o.get("position", [0, 0, 0])),
                "rotation": list(o.get("rotation", [0, 0, 0])),
                "scale": o.get("scale", 1)}
        base["scale"] = [base["scale"]] * 3 if isinstance(base["scale"], (int, float)) else list(base["scale"])
        obj.location, obj.rotation_euler, obj.scale = t2b(base["position"]), t2b_euler(base["rotation"]), t2b_scale(base["scale"])
        objs[oid] = obj
        by_prop = {}
        for a in o.get("anim") or []:
            by_prop.setdefault(a["prop"], []).append(a)
        for prop, tracks in by_prop.items():
            if prop == "opacity":
                mat = obj.data.materials[0].copy() if obj.data.materials else make_material(oid + "_mat", {})
                obj.data.materials.clear()
                obj.data.materials.append(mat)
                mat.surface_render_method = "BLENDED"
                bsdf = next(n for n in mat.node_tree.nodes if n.bl_idname == "ShaderNodeBsdfPrincipled")
                sock = bsdf.inputs["Alpha"]
                keys = tracks_to_keys(tracks, beats, 1.0, fps)
                if keys:
                    insert_track_keys(mat.node_tree, sock, "default_value", keys, 0)
                else:
                    bake_track(mat.node_tree, sock, "default_value", tracks, beats, 1.0, fps, f_start, f_end, 0, float)
                continue
            path, conv = {"position": ("location", t2b), "rotation": ("rotation_euler", t2b_euler),
                          "scale": ("scale", lambda v: t2b_scale(v if isinstance(v, list) else [v] * 3))}[prop]
            norm_tracks = tracks
            if prop == "scale":  # kit accepts scalar scale in from/to
                norm_tracks = [dict(a, **{k: ([a[k]] * 3 if isinstance(a.get(k), (int, float)) else a[k])
                                          for k in ("from", "to") if a.get(k) is not None}) for a in tracks]
            keys = tracks_to_keys(norm_tracks, beats, base[prop], fps)
            if keys:
                insert_track_keys(obj, obj, path, keys, 3, conv)
            else:
                bake_track(obj, obj, path, norm_tracks, beats, base[prop], fps, f_start, f_end, 3, conv)

    # ---- camera: baked per frame from the kit rig (exact incl. drift + roll) ----
    if ex["bake"]:  # exact: the camera matrices renderAt actually produced
        bake_camera(scn, ex["bake"], f_start, f_end)
        cam_done = True
    else:
        cam_done = False
    cam_spec = style.get("camera", {})
    cd = bpy.data.cameras.new("Camera")
    cd.sensor_fit = "VERTICAL"
    cd.sensor_height = 24.0
    cd.clip_start, cd.clip_end = cam_spec.get("near", 0.1), cam_spec.get("far", 200.0)
    cam = bpy.data.objects.new("Camera", cd)
    scn.collection.objects.link(cam)
    scn.camera = cam
    cam.rotation_mode = "QUATERNION"
    keys = sc.get("camera") or [{"t": 0, "pos": [0, 3, 12], "target": [0, 0, 0]}]
    prev = None
    for fr in (range(0) if cam_done else range(f_start, f_end + 1)):
        s = camera_sample(keys, fr / fps, cam_spec.get("fov", 35.0), cam_spec.get("drift"))
        pos_b = t2b(s["pos"])
        q = mathutils.Matrix(look_rotation_rows(pos_b, t2b(s["target"]), s["roll"])).to_quaternion()
        if prev is not None:
            q.make_compatible(prev)  # no sign flips -> no spurious spins if interpolated/motion-blurred
        prev = q
        cam.location, cam.rotation_quaternion = pos_b, q
        cd.lens = fov_to_lens(s["fov"], cd.sensor_height)
        cam.keyframe_insert("location", frame=fr)
        cam.keyframe_insert("rotation_quaternion", frame=fr)
        cd.keyframe_insert("lens", frame=fr)

    for b in beats:  # beats -> timeline markers
        scn.timeline_markers.new(b["id"], frame=int(round(b["t"] * fps)))

    bpy.ops.wm.save_as_mainfile(filepath=os.path.join(out_dir, "scene.blend"))
    if "--still" in argv:
        fr = int(opt("--still"))
        scn.frame_set(fr)
        scn.render.filepath = os.path.join(out_dir, f"still_{fr:04d}.png")
        bpy.ops.render.render(write_still=True)
    if "--render" in argv:
        scn.render.filepath = os.path.join(out_dir, "frames", "f_####")
        bpy.ops.render.render(animation=True)
        print("mux:  ffmpeg -framerate %d -start_number 0 -i %s/frames/f_%%04d.png -i SFX.wav [-i VO.wav "
              "-filter_complex amix=inputs=2:normalize=0] -c:v libx264 -pix_fmt yuv420p -crf 16 -c:a aac "
              "-b:a 192k -shortest %s/out.mp4" % (fps, out_dir, out_dir))


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        sys.exit(0 if selftest(sys.argv[sys.argv.index("--selftest") + 1]) else 1)
    try:
        import bpy  # noqa: F401
    except ImportError:
        sys.exit("Run inside Blender: blender -b --factory-startup -P build_scene_skeleton.py -- spec.json OUT_DIR "
                 "(or: python3 build_scene_skeleton.py --selftest ref.json)")
    main(sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else [])
