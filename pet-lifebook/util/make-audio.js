#!/usr/bin/env node
/**
 * make-audio.js — 데모 배경음 생성 + 업로드 영상에서 '실제 음성' 추출(보존)
 *
 * 실행:  cd pet-lifebook && node util/make-audio.js
 *   출력:
 *     assets/haru/music-piano.m4a   피아노(오르골) 톤 배경음악 — 합성
 *     assets/haru/music-forest.m4a  숲 소리(핑크/브라운 노이즈) — 합성
 *     assets/haru/haru-voice.m4a    업로드 영상에서 추출한 실제 음성 구간 — 추출(보존)
 *
 *  ⚠ 윤리: 합성 '짖는 소리'로 살아있는 듯 연출하지 않는다.
 *    하루의 소리는 업로드 영상에서 '추출(보존)'하며 UI에 "업로드된 영상에서 추출"로 표기.
 *    (참고용 합성 bark 데모가 필요하면 BARK=1 env 로만 생성.)
 */
const { execFileSync } = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg').path;
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const HARU = path.join(ROOT, 'assets', 'haru');
function run(args){ execFileSync(ffmpeg, args, { stdio:['ignore','ignore','inherit'] }); }
function out(n){ return path.join(HARU, n); }

// 1) 오르골 피아노 — 사인 음정을 잔잔히 합성(따뜻한 회상 톤)
function makePiano(){
  const notes = [523.25,659.25,783.99,659.25,587.33,659.25,523.25,440.00]; // C E G E D E C A
  const dur = 1.4;
  const inputs = [], filters = [];
  notes.forEach((f,i) => {
    inputs.push('-f','lavfi','-t',String(dur),'-i',`sine=frequency=${f}:sample_rate=44100`);
    // 어택/릴리즈 엔벨로프 + 옥타브 살짝 + 트레몰로
    filters.push(`[${i}:a]volume='exp(-3*t)':eval=frame,atrim=0:${dur},aformat=channel_layouts=mono[n${i}]`);
  });
  const seq = notes.map((_,i)=>`[n${i}]`).join('');
  const fc = filters.join(';') + `;${seq}concat=n=${notes.length}:v=0:a=1,`
    + `aecho=0.8:0.7:60:0.3,treble=g=2,volume=0.9,aloop=loop=2:size=${44100*notes.length*dur|0}[a]`;
  run([...inputs,'-filter_complex',fc,'-map','[a]','-c:a','aac','-b:a','128k', '-y', out('music-piano.m4a')]);
  console.log('  music-piano.m4a');
}

// 2) 숲 소리 — 핑크/브라운 노이즈에 저역 필터로 바람/잎새 질감
function makeForest(){
  run([
    '-f','lavfi','-t','20','-i','anoisesrc=color=pink:sample_rate=44100:amplitude=0.18',
    '-f','lavfi','-t','20','-i','anoisesrc=color=brown:sample_rate=44100:amplitude=0.12',
    '-filter_complex',
      '[0:a]highpass=f=400,lowpass=f=6000,tremolo=f=0.3:d=0.4[w];'+
      '[1:a]lowpass=f=300[b];[w][b]amix=inputs=2:duration=longest,volume=1.4,'+
      'afade=t=in:d=2,afade=t=out:st=18:d=2[a]',
    '-map','[a]','-c:a','aac','-b:a','128k','-y', out('music-forest.m4a')
  ]);
  console.log('  music-forest.m4a');
}

// 3) 실제 음성 추출(보존) — 업로드 산책영상에서 소리 큰 구간 정규화
function extractVoice(){
  const cands = fs.existsSync(HARU)
    ? fs.readdirSync(HARU).filter(f=>/walk|clip|V\d{8}|\.mov$/i.test(f) && /\.(mp4|mov)$/i.test(f))
    : [];
  if (!cands.length){ console.log('  (추출용 영상 없음 — haru-voice.m4a 건너뜀)'); return; }
  const src = path.join(HARU, cands[0]);
  // 무음 트림 + loudnorm 으로 들리게 보정. 8초로 제한.
  run([
    '-y','-i', src, '-vn', '-t','8',
    '-af','silenceremove=start_periods=1:start_silence=0.1:start_threshold=-40dB,'+
          'loudnorm=I=-16:TP=-1.5:LRA=11,afade=t=in:d=0.2,afade=t=out:st=7.5:d=0.5',
    '-c:a','aac','-b:a','128k', out('haru-voice.m4a')
  ]);
  console.log('  haru-voice.m4a  ← 추출 원본:', cands[0]);
}

// (옵션) 참고용 합성 짖는 소리 — 기본 비활성. BARK=1 일 때만.
function makeBarkDemo(){
  // 하강 하모닉 처프 + 핑크노이즈 + 포먼트 EQ (순수 사인 '삐' 금지)
  run([
    '-f','lavfi','-t','0.35','-i',"aevalsrc='0.6*sin(2*PI*(420-180*t)*t)+0.3*sin(2*PI*2*(420-180*t)*t)':s=44100",
    '-f','lavfi','-t','0.35','-i','anoisesrc=color=pink:amplitude=0.25:sample_rate=44100',
    '-filter_complex','[0:a][1:a]amix=inputs=2,equalizer=f=900:t=q:w=1:g=6,equalizer=f=2400:t=q:w=1:g=4,'+
      'afade=t=in:d=0.02,afade=t=out:st=0.28:d=0.07,volume=1.6[a]',
    '-map','[a]','-c:a','aac','-b:a','128k','-y', out('haru-bark.m4a')
  ]);
  console.log('  haru-bark.m4a (참고용 합성)');
}

(function main(){
  if (!fs.existsSync(HARU)){ console.error('assets/haru 없음'); process.exit(1); }
  console.log('오디오 생성:');
  makePiano();
  makeForest();
  extractVoice();
  if (process.env.BARK === '1') makeBarkDemo();
  console.log('완료.');
})();
