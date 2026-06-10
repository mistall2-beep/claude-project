#!/usr/bin/env node
/**
 * make-og-card.js — 공유 썸네일(Open Graph) 카드 생성
 *
 * 실행:  cd pet-lifebook && node util/make-og-card.js
 *   입력: assets/haru/og-source.jpg (없으면 thumb/001.jpg) — 하루 '정면' 컷 권장
 *   출력: assets/haru/og-image.jpg  (1200x630, 카톡/SNS 링크 미리보기용)
 *
 *  - 1200x630 카드에 사진을 position:'top' 으로 담아 '머리 짤림' 방지
 *  - 우측에 브랜드 카드 + 문구 "우리 하루의 삶" (SVG 텍스트, 한글 폰트로 래스터)
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const HARU = path.join(ROOT, 'assets', 'haru');
const SRC  = fs.existsSync(path.join(HARU,'og-source.jpg'))
  ? path.join(HARU,'og-source.jpg') : path.join(HARU,'thumb','001.jpg');
const OUT  = path.join(HARU, 'og-image.jpg');
const W = 1200, H = 630;

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

(async () => {
  if (!fs.existsSync(SRC)){ console.error('소스 없음:', SRC); process.exit(1); }

  // 왼쪽 사진 패널(머리 안 짤리게 top 정렬) — 둥근 마스크
  const PW = 470;
  const photo = await sharp(SRC)
    .resize(PW, H, { fit:'cover', position:'top' })
    .toBuffer();

  // 배경 그라디언트 + 우측 텍스트(SVG → 한글은 시스템 폰트로 렌더)
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="#10312c"/><stop offset="1" stop-color="#1f9e8a"/>
      </linearGradient>
    </defs>
    <rect width="${W}" height="${H}" fill="url(#bg)"/>
    <g font-family="Pretendard, 'Noto Sans KR', 'IPAGothic', sans-serif" fill="#ffffff">
      <text x="${PW+70}" y="${H/2-66}" font-size="30" fill="#bff0e6" font-weight="700" letter-spacing="2">PET LIFEBOOK</text>
      <text x="${PW+70}" y="${H/2+10}" font-size="78" font-weight="800">${esc('우리 하루의 삶')}</text>
      <text x="${PW+70}" y="${H/2+74}" font-size="30" fill="#d9f3ee">${esc('흩어진 기억을 읽어, 한 권의 삶으로')}</text>
    </g>
  </svg>`;

  // 사진 둥근 모서리 마스크
  const radius = 28;
  const mask = Buffer.from(
    `<svg width="${PW}" height="${H}"><rect x="0" y="0" width="${PW}" height="${H}" rx="${radius}" ry="${radius}"/></svg>`
  );
  const rounded = await sharp(photo)
    .composite([{ input: mask, blend:'dest-in' }])
    .png().toBuffer();

  await sharp(Buffer.from(svg))
    .composite([{ input: rounded, left: 0, top: 0 }])
    .jpeg({ quality: 88 })
    .toFile(OUT);

  console.log(`완료: ${path.relative(ROOT,OUT)} (1200x630)  ← 소스 ${path.basename(SRC)}`);
})();
