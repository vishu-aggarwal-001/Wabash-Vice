// Rocketbox avatars for the web: WebP textures (body/head 1024, hair 512), alpha cut-out
// hair and eyelashes, meshopt geometry.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune, dedup, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'fs';
await MeshoptEncoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const [inDir, outDir, only] = process.argv.slice(2);
fs.mkdirSync(outDir, { recursive: true });
for (const f of fs.readdirSync(inDir).filter(f => f.endsWith('.glb') && (!only || f.includes(only)))) {
  const doc = await io.read(`${inDir}/${f}`);
  const sizes = new Map();
  for (const m of doc.getRoot().listMaterials()) {
    const n = m.getName();
    const hair = /hair/.test(n);
    m.setAlphaMode(hair ? 'MASK' : 'OPAQUE'); if (hair) m.setAlphaCutoff(0.3);
    m.setDoubleSided(false);
    m.setMetallicFactor(0); m.setRoughnessFactor(/equip/.test(n) ? 0.55 : 0.82);
    const t = m.getBaseColorTexture(); if (t) sizes.set(t, hair ? 512 : 1024);
  }
  await doc.transform(prune(), dedup());
  for (const t of doc.getRoot().listTextures()) {
    const img = t.getImage(); if (!img) continue;
    const sz = sizes.get(t) || 512;
    const alpha = sz === 512;
    let pipe = sharp(Buffer.from(img)).resize(sz, sz, { fit: 'inside' });
    if (alpha) {
      // hair cards: paint the see-through pixels with the hair's own colour so cut-out edges don't glow white
      const { data, info } = await pipe.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 200) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
      if (n) { r /= n; g /= n; b /= n; for (let i = 0; i < data.length; i += 4) if (data[i + 3] < 160) { data[i] = r; data[i + 1] = g; data[i + 2] = b; } }
      pipe = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
    }
    const buf = await pipe.webp({ quality: 82, alphaQuality: 90 }).toBuffer();
    t.setImage(new Uint8Array(buf)).setMimeType('image/webp');
  }
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(`${outDir}/${f}`, doc);
  console.log(f, (fs.statSync(`${outDir}/${f}`).size / 1024).toFixed(0) + 'KB');
}
