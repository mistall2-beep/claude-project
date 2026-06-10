#!/usr/bin/env node
/**
 * make-memorial-video.js — 사진 슬라이드 → 페이드 회상(回想) 영상
 *
 * 실행:  cd pet-lifebook && node util/make-memorial-video.js
 *   입력: util/curated.json 의 대표 컷(없으면 assets/haru/thumb 전부)에서 12장 선별
 *   출력: assets/haru/haru-memorial.mp4   (무음, 1080x1080, 페이드 인/아웃)
 *
 *  ⚠ ffmpeg-installer 정적 빌드에는 xfade 필터가 없다 →
 *    클립별 fade(in/out) 후 concat 디멀티플렉서로 이어붙인다.
 *  ⚠ 윤리: '보존·회상' 톤. 자극적 장면(화장로/유골 등) 없음. 무음(음악은 앱에서 입힘).
 */
const { execFileSync } = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT  = process.cwd();
const THUMB = path.join(ROOT, 'assets', 'haru', 'thumb');
const OUT   = path.join(ROOT, 'assets', 'haru', 'haru-memorial.mp4');
const WORK  = path.join(ROOT, 'util', '.frames');
const N = 12, SECS = 2.6, SIZE = 1080, FADE = 0.6, FPS = 30;

function run(args){ execFileSync(ffmpeg, args, { stdio:['ignore','ignore','inherit'] }); }
function pickPhotos(){
  const cur = path.join(ROOT, 'util', 'curated.json');
  let ids = [];
  if (fs.existsSync(cur)){
    const c = JSON.parse(fs.readFileSync(cur,'utf8'));
    // 연도별로 고르게 뽑아 '삶의 흐름'이 보이도록
    const years = Object.keys(c.byYear || {}).sort();
    for (const y of years) for (const id of c.byYear[y]) ids.push(id);
  }
  if (!ids.length && fs.existsSync(THUMB))
    ids = fs.readdirSync(THUMB).filter(f=>/\.jpg$/.test(f)).map(f=>f.replace('.jpg',''));
  // 균등 샘플 N장
  const step = Math.max(1, Math.floor(ids.length / N));
  const sel = [];
  for (let i=0;i<ids.length && sel.length<N;i+=step) sel.push(ids[i]);
  return sel.map(id => path.join(THUMB, `${id}.jpg`));
}

(async () => {
  const photos = pickPhotos();
  if (!photos.length){ console.error('썸네일 없음 — 먼저 gen-thumbnails.js'); process.exit(1); }
  fs.rmSync(WORK, { recursive:true, force:true });
  fs.mkdirSync(WORK, { recursive:true });
  console.log(`회상 영상: ${photos.length}장 × ${SECS}s`);

  const clips = [];
  photos.forEach((src, i) => {
    const clip = path.join(WORK, `c${String(i).padStart(2,'0')}.mp4`);
    // 사진을 정사각 캔버스 중앙배치 + 느린 줌(켄번스) + 양끝 페이드
    run([
      '-y', '-loop','1','-t',String(SECS),'-i', src,
      '-vf', [
        `scale=${SIZE*1.12}:${SIZE*1.12}:force_original_aspect_ratio=increase`,
        `crop=${SIZE}:${SIZE}`,
        `zoompan=z='min(zoom+0.0008,1.10)':d=${Math.round(SECS*FPS)}:s=${SIZE}x${SIZE}:fps=${FPS}`,
        `fade=t=in:st=0:d=${FADE}`,
        `fade=t=out:st=${(SECS-FADE).toFixed(2)}:d=${FADE}`
      ].join(','),
      '-c:v','libx264','-pix_fmt','yuv420p','-r',String(FPS), clip
    ]);
    clips.push(clip);
  });

  const listFile = path.join(WORK, 'list.txt');
  fs.writeFileSync(listFile, clips.map(c=>`file '${c}'`).join('\n'));
  run([
    '-y','-f','concat','-safe','0','-i', listFile,
    '-c:v','libx264','-pix_fmt','yuv420p','-crf','22','-preset','medium',
    '-movflags','+faststart', '-an', OUT
  ]);

  fs.rmSync(WORK, { recursive:true, force:true });
  const mb = (fs.statSync(OUT).size/1048576).toFixed(1);
  console.log(`완료: ${path.relative(ROOT,OUT)} (${mb}MB, 무음)`);
})();
