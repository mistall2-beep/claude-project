#!/usr/bin/env node
/**
 * gen-thumbnails.js — 원본 사진 → 420px 스마트크롭 썸네일 + 메타데이터
 *
 * 실행:  cd pet-lifebook && node util/gen-thumbnails.js
 *
 *  - 입력 : assets/haru/ 안의 원본 사진(.jpg/.jpeg/.png)
 *  - 출력 : assets/haru/thumb/NNN.jpg  (420x420, position:'attention' 스마트크롭)
 *           util/manifest.json         (파일명·연도·해상도·선명도·엔트로피·dHash)
 *
 *  연도는 EXIF DateTimeOriginal → 없으면 파일명(YYYYMMDD/IMG_YYYY...) → 파일 mtime 순으로 추정.
 *  dHash(64bit) 는 큐레이션(curate-album.js)에서 중복 판정에 사용.
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();                       // pet-lifebook/
const SRC  = path.join(ROOT, 'assets', 'haru');
const OUT  = path.join(SRC, 'thumb');
const MAN  = path.join(ROOT, 'util', 'manifest.json');
const SIZE = 420;

const isImg = f => /\.(jpe?g|png)$/i.test(f) && !/thumb/i.test(f);

function guessYear(file, exifDate, mtime){
  if (exifDate){
    const y = String(exifDate).slice(0,4);
    if (/^(19|20)\d\d$/.test(y)) return +y;
  }
  const m = file.match(/(?:^|[^\d])(20\d{2})[01]\d[0-3]\d/) || file.match(/(20\d{2})/);
  if (m) return +m[1];
  return new Date(mtime).getFullYear();
}

// 8x8 average-hash (밝기 기반) → 64bit 16진수 문자열
async function dHash(buf){
  const g = await sharp(buf).greyscale().resize(8,8,{fit:'fill'}).raw().toBuffer();
  const avg = g.reduce((a,b)=>a+b,0) / g.length;
  let bits = '';
  for (const v of g) bits += v > avg ? '1' : '0';
  let hex = '';
  for (let i=0;i<64;i+=4) hex += parseInt(bits.slice(i,i+4),2).toString(16);
  return hex;
}

(async () => {
  if (!fs.existsSync(SRC)) { console.error('원본 폴더 없음:', SRC); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });

  const files = fs.readdirSync(SRC).filter(isImg).sort();
  console.log(`원본 ${files.length}장 → 썸네일 생성 (${SIZE}px)`);

  const manifest = [];
  let n = 0;
  for (const file of files){
    const src = path.join(SRC, file);
    try{
      const img  = sharp(src, { failOn: 'none' });
      const meta = await img.metadata();
      const stat = fs.statSync(src);

      const id  = String(++n).padStart(3, '0');
      const out = path.join(OUT, `${id}.jpg`);
      const buf = fs.readFileSync(src);

      await sharp(buf, { failOn:'none' })
        .rotate()                                            // EXIF 방향 보정
        .resize(SIZE, SIZE, { fit:'cover', position:'attention' })  // 피사체 중심 크롭
        .jpeg({ quality: 82, mozjpeg: true })
        .toFile(out);

      // 선명도(라플라시안 분산 근사) · 엔트로피 통계
      const stats = await sharp(buf,{failOn:'none'}).greyscale().stats();
      const sharpness = stats.channels[0].stdev;             // 표준편차 ≈ 대비/선명도
      const entropy   = stats.entropy ?? 0;

      manifest.push({
        id, file,
        year: guessYear(file, meta.exif && null, stat.mtimeMs),
        w: meta.width || 0, h: meta.height || 0,
        minDim: Math.min(meta.width||0, meta.height||0),
        sharpness: +sharpness.toFixed(2),
        entropy: +entropy.toFixed(3),
        dhash: await dHash(buf)
      });
      if (n % 25 === 0) console.log(`  …${n}장`);
    }catch(e){
      console.warn('  건너뜀:', file, e.message);
    }
  }

  fs.writeFileSync(MAN, JSON.stringify(manifest, null, 2));
  console.log(`완료: 썸네일 ${manifest.length}장 → ${path.relative(ROOT,OUT)}`);
  console.log(`메타: ${path.relative(ROOT,MAN)}`);
})();
