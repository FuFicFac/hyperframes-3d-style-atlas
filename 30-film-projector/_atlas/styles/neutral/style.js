// styles/neutral/style.js — reference implementation of the style contract (see references/kit-api.md).
import * as THREE from "three";
import { applyStyleSpec } from "../../kit/spec.js";
import { createGround } from "../../kit/builders.js";
import { createTextLabel, FONTS } from "../../kit/text.js";
import { STYLE_SPEC } from "./spec.js";
export { STYLE_SPEC };

/**
 * createStyle(stage, opts?) -> style
 *   opts: { post = true }
 */
export function createStyle(stage, opts = {}) {
  const spec = STYLE_SPEC;
  const { materials, lights, post } = applyStyleSpec(stage, spec, opts);
  const textStyle = { font: FONTS[spec.text.font] ?? spec.text.font, weight: spec.text.weight, color: spec.text.color, height: spec.text.height };

  const props = {
    ground: (o = {}) => createGround({ size: 60, material: materials.floor, ...o }),
    label: (text, o = {}) => createTextLabel(text, { ...textStyle, ...o }),
    block: (o = {}) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(o.w ?? 1, o.h ?? 1, o.d ?? 1), materials[o.material ?? "clayPrimary"]);
      m.castShadow = m.receiveShadow = true;
      return m;
    },
  };

  return {
    spec,
    palette: spec.palette,
    materials,
    lights,
    post,
    textStyle,
    props,
    sfx: spec.sfx,
    camera: spec.camera,
    factories: {}, // procedural factories for objectsFromSpec (none in neutral)
  };
}
