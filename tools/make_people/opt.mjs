// Post-process MakeHuman exports for the web: correct alpha modes, WebP textures,
// capped sizes, quantized + meshopt-compressed geometry.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, textureCompress, quantize, weld, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';

await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [inDir, outDir] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
const cutout = /eyebrow|eyelash|short0|long0|bob0|ponytail|braid|afro/i;
for (const f of fs.readdirSync(inDir).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(`${inDir}/${f}`);
  for (const m of doc.getRoot().listMaterials()) {
    const n = m.getName();
    if (cutout.test(n)) { m.setAlphaMode('MASK'); m.setAlphaCutoff(n.match(/eyelash|eyebrow/i) ? 0.3 : 0.45); }
    else m.setAlphaMode('OPAQUE');
    m.setDoubleSided(cutout.test(n));
    m.setMetallicFactor(0); m.setRoughnessFactor(n.match(/boots|shoes|sneakers/i) ? 0.55 : 0.85);
  }
  // body skin texture keeps 1024; everything else 512
  const skins = new Set(doc.getRoot().listMaterials().filter(m => /body/i.test(m.getName())).map(m => m.getBaseColorTexture()).filter(Boolean));
  await doc.transform(
    prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', quality: 82, resize: [1024, 1024], pattern: null }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  for (const t of doc.getRoot().listTextures()) {
    if (skins.has(t)) continue;
    const img = t.getImage(); if (!img) continue;
    const buf = await sharp(Buffer.from(img)).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    t.setImage(new Uint8Array(buf)).setMimeType('image/webp');
  }
  await io.write(`${outDir}/${f}`, doc);
  console.log(f, fs.statSync(`${inDir}/${f}`).size, '->', fs.statSync(`${outDir}/${f}`).size);
}
