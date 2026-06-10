#!/usr/bin/env node
/**
 * transcode-video.js — 업로드 영상 회전보정·압축 + 포스터 추출
 *
 * 실행:  cd pet-lifebook && node util/transcode-video.js <입력영상> <출력이름>
 *   예:  node util/transcode-video.js assets/haru/V20230326_120000.mp4 haru-walk-spring
 *
 *   출력: assets/haru/<출력이름>.mp4          (세로 720x1280 이내, h264, +faststart)
 *         assets/haru/<출력이름>-poster.jpg   (1초 지점 프레임)
 *
 *  - autorotate 로 EXIF/메타 회전을 굽고( metadata:rotate=0 ) 화면 깨짐 방지
 *  - +faststart 로 웹 스트리밍 시 즉시 재생(모바일 데모)
 */
const { execFileSync } = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');

const [,, inArg, nameArg] = process.argv;
if (!inArg || !nameArg){
  console.error('사용법: node util/transcode-video.js <입력영상> <출력이름>');
  process.exit(1);
}
const ROOT = process.cwd();
const SRC  = path.resolve(ROOT, inArg);
const OUT  = path.join(ROOT, 'assets', 'haru', `${nameArg}.mp4`);
const POST = path.join(ROOT, 'assets', 'haru', `${nameArg}-poster.jpg`);

if (!fs.existsSync(SRC)){ console.error('입력 없음:', SRC); process.exit(1); }

function run(args){ execFileSync(ffmpeg, args, { stdio:'inherit' }); }

console.log('영상 변환:', path.basename(SRC), '→', path.basename(OUT));
run([
  '-y', '-noautorotate', '-i', SRC,
  // 메타데이터 회전값을 실제 픽셀에 반영(autorotate)하고 메타는 0으로
  '-vf', 'scale=720:1280:force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2',
  '-metadata:s:v:0', 'rotate=0',
  '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p',
  '-crf', '24', '-preset', 'medium',
  '-c:a', 'aac', '-b:a', '96k',
  '-movflags', '+faststart',
  OUT
]);

console.log('포스터 추출 →', path.basename(POST));
run(['-y', '-ss', '1', '-i', OUT, '-frames:v', '1', '-q:v', '3', POST]);

const mb = (fs.statSync(OUT).size/1048576).toFixed(1);
console.log(`완료: ${path.relative(ROOT,OUT)} (${mb}MB) + 포스터`);
