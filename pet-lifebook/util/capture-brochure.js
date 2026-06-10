#!/usr/bin/env node
/**
 * capture-brochure.js — 앱 화면을 캡처해 브로셔용 이미지로 저장
 *
 * 실행:  cd pet-lifebook && node util/capture-brochure.js
 *   입력: app.html (로컬 파일) — 모바일 폰 목업/데스크탑 화면
 *   출력: assets/brochure/cap-*.png  (brochure.html 이 참조하는 9컷)
 *
 *  puppeteer 헤드리스로 app.html 을 띄우고, 각 탭/화면을 deep-link(#) 로 이동시킨 뒤
 *  .screen(폰 목업) 요소를 잘라서 저장한다. 데스크탑 컷만 전체 뷰포트 캡처.
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const ROOT = process.cwd();
const APP  = 'file://' + path.join(ROOT, 'app.html');
const OUT  = path.join(ROOT, 'assets', 'brochure');

// [파일명, 딥링크 해시, 셀렉터(없으면 .screen), 설명]
const SHOTS = [
  ['cap-home',     '#home',           '.screen', '오늘의 하루(홈)'],
  ['cap-timeline', '#story',          '.screen', '타임라인'],
  ['cap-read',     '#story?read=1',   '.screen', '삶을 읽다(근거 보기)'],
  ['cap-map',      '#story?tab=map',  '.screen', '산책 경로 복원'],
  ['cap-voice',    '#story?tab=voice','.screen', '보존된 소리'],
  ['cap-video',    '#home?clip=1',    '.screen', '회상 영상'],
  ['cap-keep',     '#book',           '.screen', '한 권으로 남기기'],
  ['cap-gallery',  '#story?tab=all',  '.screen', '전체 갤러리'],
  ['cap-desktop',  '#desktop',        null,      '데스크탑(PC) 화면'],
];

(async () => {
  if (!fs.existsSync(path.join(ROOT,'app.html'))){ console.error('app.html 없음 (pet-lifebook/ 에서 실행)'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive:true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--force-device-scale-factor=2']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 2 });

  for (const [name, hash, sel, desc] of SHOTS){
    const file = path.join(OUT, `${name}.png`);
    await page.goto(APP + hash, { waitUntil:'networkidle0' });
    // 인트로 오버레이가 있으면 진입
    await page.evaluate(() => { try{ window.enterApp && window.enterApp(); }catch(e){} });
    await new Promise(r => setTimeout(r, 700));   // 전환/애니메이션 안정화

    if (sel){
      const el = await page.$(sel);
      if (el){ await el.screenshot({ path:file }); }
      else { await page.screenshot({ path:file }); }
    } else {
      await page.screenshot({ path:file });        // 데스크탑 전체
    }
    console.log(`  ${name}.png  — ${desc}`);
  }

  await browser.close();
  console.log(`완료: 브로셔 캡처 ${SHOTS.length}컷 → ${path.relative(ROOT,OUT)}`);
})();
