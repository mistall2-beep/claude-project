#!/usr/bin/env node
/**
 * curate-album.js — 앨범 자동 큐레이션(흔들림·중복·저해상도 제거)
 *
 * 실행:  cd pet-lifebook && node util/curate-album.js
 *   입력: util/manifest.json (gen-thumbnails.js 산출물)
 *   출력: util/curated.json  (앱 갤러리에 쓸 대표 컷 id 목록 + 제외 사유)
 *
 * 규칙
 *  1) 저해상도   : minDim < 480 → 제외
 *  2) 흔들림     : sharpness(대비 표준편차)가 하위 12% 미만 → 제외
 *  3) 중복       : dHash 해밍거리 ≤ 6 이면 같은 장면으로 보고, 선명한 쪽만 남김
 *
 *  ⚠ 인물(남자 얼굴) 제외 같은 가치판단은 자동화하지 않는다.
 *    작은 썸네일로는 성별/인물 판단이 불안정하므로 app.html PHOTOS 배열에서 수동 보정.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const MAN  = path.join(ROOT, 'util', 'manifest.json');
const OUT  = path.join(ROOT, 'util', 'curated.json');

const MIN_DIM     = 480;
const DUP_HAMMING = 6;
const BLUR_PCTL   = 0.12;   // 선명도 하위 12% 컷

function hamming(a, b){
  let d = 0;
  for (let i=0;i<a.length;i++){
    let x = parseInt(a[i],16) ^ parseInt(b[i],16);
    while (x){ d += x & 1; x >>= 1; }
  }
  return d;
}

function main(){
  if (!fs.existsSync(MAN)){ console.error('manifest.json 없음 — 먼저 gen-thumbnails.js 실행'); process.exit(1); }
  const items = JSON.parse(fs.readFileSync(MAN, 'utf8'));
  const reasons = {};
  const drop = id => { if(!reasons[id]) reasons[id]=[]; };

  // 1) 저해상도
  for (const it of items) if (it.minDim < MIN_DIM){ drop(it.id); reasons[it.id].push(`저해상도(${it.minDim}px)`); }

  // 2) 흔들림 — 선명도 분포에서 하위 12% 임계
  const sorted = items.map(i=>i.sharpness).sort((a,b)=>a-b);
  const thr = sorted[Math.floor(sorted.length * BLUR_PCTL)] ?? 0;
  for (const it of items) if (it.sharpness < thr){ drop(it.id); reasons[it.id].push(`흔들림(선명도 ${it.sharpness}<${thr.toFixed(1)})`); }

  // 3) 중복 — 선명한 순으로 보며 이미 채택된 컷과 가까우면 제외
  const order = [...items].sort((a,b)=> b.sharpness - a.sharpness);
  const kept = [];
  for (const it of order){
    if (reasons[it.id]) continue;                 // 이미 1·2에서 탈락
    const dup = kept.find(k => hamming(k.dhash, it.dhash) <= DUP_HAMMING);
    if (dup){ drop(it.id); reasons[it.id].push(`중복(≈${dup.id})`); }
    else kept.push(it);
  }

  const keptIds = items.filter(i => !reasons[i.id]).map(i => i.id);
  const byYear = {};
  for (const it of items) if (!reasons[it.id]) (byYear[it.year] ??= []).push(it.id);

  const result = {
    total: items.length,
    kept: keptIds.length,
    dropped: Object.keys(reasons).length,
    rules: { MIN_DIM, DUP_HAMMING, blurThreshold:+thr.toFixed(2) },
    keptIds,
    byYear,
    droppedReasons: reasons
  };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
  console.log(`큐레이션: ${items.length}장 → 채택 ${keptIds.length} / 제외 ${result.dropped}`);
  console.log(`연도분포:`, Object.fromEntries(Object.entries(byYear).map(([y,v])=>[y,v.length])));
  console.log(`→ ${path.relative(ROOT,OUT)}`);
}
main();
