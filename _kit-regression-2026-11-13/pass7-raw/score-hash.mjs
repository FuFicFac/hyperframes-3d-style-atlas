// score-hash.mjs <soundJsPath> — sha256 of renderScore over a fixed score using every pre-pass-7 voice + alias
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
const { renderScore } = await import(pathToFileURL(process.argv[2]).href);
const types = ["whoosh","whooshIn","whooshOut","pop","click","tick","paper","rustle","fold","thud","impact","riser","chime","sparkle","bubble","rumble","clack","blip","buzz","hum","pad","squish","penScratch","murmur","servo","whir"];
const score = types.map((type, i) => ({ t: 0.05 + i * 0.37, type, gain: 0.5, pan: ((i % 5) - 2) / 2, seed: i + 2, ...(type === "blip" ? { notes: [0, 4, 7] } : {}), ...(type === "pad" ? { dur: 4, root: 196, brightness: 900 } : {}) }));
const b = renderScore(score, { duration: 12, duck: [{ start: 3, end: 5 }] });
const h = createHash("sha256"); h.update(Buffer.from(b.left.buffer)); h.update(Buffer.from(b.right.buffer));
console.log(h.digest("hex"));
