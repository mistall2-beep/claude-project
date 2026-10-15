/* SunBaby 2.0 시뮬레이션 솔루션 — 엔진 + 화면
 * 구조: 아기 로봇(센서·Rule Engine 판정) → 태블릿(BabyCareCenter 2.0 · AI Coach) → 클라우드(AI Report · 표준모델 · 대시보드)
 * 원칙: Rule Engine이 판정하고 AI는 해석만 한다. AI 장애(오프라인)에도 기본 교육은 계속된다. */
(function () {
  'use strict';
  const { SENSORS, POSES, ACTIONS, SCORE1, SCORE2, SAFETY_GRADE, GRADE_MSG, EVENTS, EV, CAT, COURSES, PERSONAS, TEMPERAMENTS, STD, KB, REGIONS, BORYEONG, PUBLIC_APIS, CURRICULUM, TRAINEES } = window.SB;

  // ---------- 유틸 ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
  const med = a => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const r1 = v => v == null ? '—' : (Math.round(v * 10) / 10).toString();
  const fmtT = t => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), s = t % 60; return (h ? h + ':' : '') + String(m).padStart(h ? 2 : 1, '0') + ':' + String(s).padStart(2, '0'); };
  const fmtN = n => Number(n).toLocaleString('ko-KR');
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function gauss(R) { let u = 0, v = 0; while (!u) u = R(); while (!v) v = R(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600); }
  const nowStr = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  // 같은 조건 코호트 (C-2026-Q3, n=240 · 시연용 합성 분포)
  const COHORT = (() => { const R = mulberry(7); const a = []; for (let i = 0; i < 240; i++) a.push(clamp(Math.round(76 + gauss(R) * 10.5), 40, 100)); return a.sort((x, y) => x - y); })();
  const pctile = v => Math.round(COHORT.filter(x => x < v).length / COHORT.length * 100);

  // ---------- 저장소 (데이터레이크 시뮬레이션) ----------
  const store = { sessions: [], current: null, lake: { sessions: 1284, events: 21840, records: 2913400, inst: 40, consent: 93.4 }, reviewed: {}, tier: 'ai', series: [] };
  const allSessions = () => [...store.series, ...store.sessions];
  function lakeTxt() { $('#liveTxt').textContent = `데이터레이크 · 세션 ${fmtN(store.lake.sessions)} · 레코드 ${(store.lake.records / 1e6).toFixed(2)}M`; }

  // =====================================================================
  //  Rule Engine + 시나리오 엔진 (UI와 분리 — 헤드리스 실행 가능)
  // =====================================================================
  function Engine(cfg, cb) {
    cb = cb || {};
    const P = cfg.persona ? PERSONAS[cfg.persona] : null;
    const T = TEMPERAMENTS[cfg.temper] || TEMPERAMENTS.normal;
    const LV = { 1: 1.3, 2: 1, 3: 0.75 }[cfg.level] || 1;
    const R = cfg.rand || Math.random;
    const rr = (a, b) => a + (b - a) * R();
    const course = COURSES[cfg.course];
    const E = {
      cfg, t: 0, pose: 'lie', act: {}, diaper: 'on', diaperWasOff: false, envNoise: false, envLight: false,
      main: null, alerts: [], queue: (cfg.course === 'single' ? [{ t: 3, id: cfg.single }] : course.list.map(x => ({ ...x }))),
      done: false, proneT: 0, evs: [], safety: [], dangers: [], choices: [], hintEv: 0, lastFx: null,
      m: { lifts: 0, neckMiss: 0, tiltMax: null, gyroOver: 0, rollMax: null, reacts: [], burpFirst: [] },
    };
    const log = (cls, txt) => cb.log && cb.log(E.t, cls, txt);
    const coach = (type, p) => cb.coach && cb.coach(type, p || {});
    function has(k) {
      if (k.startsWith('pose:')) return E.pose === k.slice(5);
      if (k === 'diaper:off') return E.diaper === 'off';
      if (k === 'diaper:new') return E.diaper === 'on' && E.diaperWasOff;
      if (k[0] === '!') return !E.act[k.slice(1)];
      return !!E.act[k];
    }
    const all = need => need.every(has);
    const activeAlert = id => E.alerts.find(a => a.def.id === id);

    function raise(id, why) {
      if (activeAlert(id) || E.done) return;
      const def = EV[id];
      E.alerts.push({ def, start: E.t, ap: null });
      if (id === 'flip') E.pose = 'prone';
      if (id === 'noise') E.envNoise = true;
      if (id === 'light') E.envLight = true;
      if (id === 'bath') { E.act.neck = false; E.pose = 'lie'; }
      log('s', `⚠ 안전 이벤트 · ${def.name} [${def.trig}] — ${def.signal} ${def.snd}${why ? ' · ' + why : ''}`);
      coach('alert', { def });
    }
    function clearEnv(id) { if (id === 'noise') E.envNoise = false; if (id === 'light') E.envLight = false; }

    function startMain(def) {
      const sec = def.c2.sec > 1 ? Math.round(def.c2.sec * T.mul) : def.c2.sec;
      E.main = { def, start: E.t, phase: 1, t1: null, s1: 0, g1: 'F', prog: 0, sec, limit: Math.round(def.limit * LV), react: null, hints: 0, autoH: 0, choice: null, firstPat: null, ap: null };
      E.diaperWasOff = E.diaper === 'off';
      log('r', `▶ ${CAT[def.cat]} · ${def.name} 시작 — 신호 ${def.signal} ${def.snd} ×3 (제한 ${fmtT(E.main.limit)})`);
      coach('start', { def });
    }
    function finishMain(res) {
      const m = E.main, def = m.def, el = E.t - m.start;
      const s1 = res === 'none' ? 0 : m.s1, g1 = res === 'none' ? 'F' : m.g1, s2 = SCORE2[res];
      if (m.react != null && def.cat === 'daily') E.m.reacts.push(m.react);
      if (def.id === 'burp' && m.firstPat != null) E.m.burpFirst.push(m.firstPat);
      const rec = { id: def.id, name: def.name, cat: def.cat, start: m.start, dur: +el.toFixed(1), t1: m.t1, g1, s1, g2: s2.g, s2: s2.s, res, score: s1 + s2.s, react: m.react, hints: m.hints, choice: m.choice, firstPat: m.firstPat };
      E.evs.push(rec);
      if (m.hints > 0) E.hintEv++;
      E.lastFx = { txt: res === 'done' ? def.ok : def.ng, good: res === 'done', until: E.t + 6 };
      log(res === 'done' ? 'g' : 's', `■ ${def.name} — ${s2.t} · 1차 ${g1} ${s1} + 2차 ${s2.g} ${s2.s} = ${rec.score}점 · ${res === 'done' ? def.ok : def.ng}`);
      E.main = null;
      coach('end', { def, rec });
      if (def.next && res === 'done') E.queue.push({ t: E.t + def.next.after, id: def.next.id });
      if (def.next && res !== 'done') log('', `· ${EV[def.next.id].name} 자동 패스 (선행 이벤트 미완료)`);
      if (def.fail && res !== 'done') { E.queue.push({ t: E.t + def.fail.after, id: def.fail.id }); log('s', `… 트림 실패 → ${def.fail.after / 60}분 후 기도폐쇄 응급 이벤트 예약`); }
      E.queue.sort((a, b) => a.t - b.t);
      if (P) resetHands();
      if (cfg.stage === 3) coach('adapt', { rec });
    }

    function mark(k) {
      const m = E.main;
      if (m && m.react == null) m.react = +(E.t - m.start).toFixed(1);
      if (m && k === 'pat' && m.def.id === 'burp' && m.firstPat == null) m.firstPat = +(E.t - m.start).toFixed(1);
    }
    function setPose(p) {
      if (E.done || E.pose === p) return;
      const prev = E.pose;
      const lift = (prev === 'lie' || prev === 'prone') && p !== 'lie' && p !== 'prone';
      if (lift) {
        E.m.lifts++;
        const tilt = E.act.neck ? rr(5, 14) : rr(28, 42);
        E.m.tiltMax = Math.max(E.m.tiltMax || 0, tilt);
        if (!E.act.neck) { E.m.neckMiss++; E.dangers.push({ t: E.t, k: '목 지지 없이 들어올림' }); }
        E.pose = p; mark('pose');
        log('', `· 자세 → ${POSES[p].name} (${POSES[p].code}) · 머리 기울기 ${tilt.toFixed(0)}°`);
        if (!E.act.neck) raise('neckdrop', `머리 기울기 ${tilt.toFixed(0)}° > 허용 20°`);
      } else {
        E.pose = p; mark('pose');
        log('', `· 자세 → ${POSES[p].name} (${POSES[p].code})`);
      }
      if (p === 'prone') { E.dangers.push({ t: E.t, k: '엎드려 놓기' }); if (E.main && E.main.def.id === 'sleep') E.m.rollMax = 180; }
      if (p === 'upside') { E.dangers.push({ t: E.t, k: '거꾸로 들기' }); raise('upside'); }
      if (p === 'lie' && E.main && E.main.def.id === 'sleep') E.m.rollMax = Math.max(E.m.rollMax || 0, rr(3, 11));
    }
    function toggle(k, on) {
      if (E.done) return;
      if (on === undefined) on = !E.act[k];
      if (!!E.act[k] === on) return;
      E.act[k] = on;
      if (on) mark(k);
      log('', `· ${ACTIONS[k].name} ${on ? '시작' : '중지'}`);
      if (k === 'shake' && on) { E.m.gyroOver++; E.dangers.push({ t: E.t, k: '세게 흔들기' }); raise('shaken', '각속도 임계 초과'); }
    }
    function moment(k) {
      if (E.done) return;
      mark(k);
      if (k === 'diaperOff') { E.diaper = 'off'; E.diaperWasOff = true; }
      if (k === 'diaperOn' && E.diaper === 'off') E.diaper = 'on';
      log('', `· ${ACTIONS[k].name}`);
    }
    function answer(idx) {
      const m = E.main; if (!m || !m.def.coach.ch || m.choice != null) return null;
      const c = m.def.coach.ch[idx]; m.choice = !!c.ok; E.choices.push(m.choice);
      log('a', `◆ 선택형 응답 "${c.t}" → ${c.ok ? '정답' : '오답'} (판단 정확도)`);
      return m.choice;
    }
    function hint(auto) {
      const m = E.main; if (!m) return null;
      const hs = m.def.coach.h, i = Math.min(m.hints, hs.length - 1);
      m.hints++; if (auto) m.autoH++;
      log('a', `◆ AI 힌트 ${i + 1}단계 ${auto ? '(학습모드 자동)' : '(요청)'}`);
      coach('hint', { def: m.def, i, text: hs[i], auto });
      return hs[i];
    }

    // ----- 자동 실습자 (페르소나) -----
    function applyNeeds(need) {
      for (const k of need) {
        if (has(k)) continue;
        if (k.startsWith('pose:')) {
          const p = k.slice(5);
          const lifting = (E.pose === 'lie' || E.pose === 'prone') && p !== 'lie' && p !== 'prone';
          if (lifting && !E.act.neck && R() > P.neckMiss) toggle('neck', true);
          setPose(p);
          if (p === 'lie' && E.act.neck) toggle('neck', false);
        } else if (k === 'diaper:off') moment('diaperOff');
        else if (k === 'diaper:new') moment('diaperOn');
        else if (k[0] === '!') toggle(k.slice(1), false);
        else toggle(k, true);
      }
    }
    function resetHands() { for (const k in E.act) if (k !== 'neck' && E.act[k]) toggle(k, false); }
    function auto() {
      if (!P) return;
      for (const a of E.alerts) {
        if (!a.ap) a.ap = { at: rr(P.fix[0], P.fix[1]) };
        if (E.t - a.start >= a.ap.at) applyNeeds(a.def.fix);
      }
      const m = E.main; if (!m) return;
      const el = E.t - m.start;
      if (!m.ap) {
        m.ap = { d: rr(P.react[0], P.react[1]), quit: R() < P.quit ? rr(0.3, 0.85) : null, wrong: R() < P.wrong, ans: false, hint: false, shake: m.def.id === 'sleep' && R() < P.shake, dOn: null };
        if (m.ap.wrong) m.ap.d += rr(6, 18);
      }
      const ch = m.def.coach.ch;
      if (ch && !m.ap.ans && cfg.mode !== 'eval' && !cfg.offline && el >= m.ap.d * 0.5) {
        m.ap.ans = true;
        const ok = R() < P.choice, idx = ch.findIndex(c => ok ? c.ok : !c.ok);
        if (answer(idx) != null) coach('autoAnswer', { idx, ok: m.choice });
      }
      if (!m.ap.hint && cfg.mode === 'practice' && !cfg.offline && el >= m.ap.d * 0.7) { m.ap.hint = true; if (R() < P.hintAsk) hint(false); }
      if (el < m.ap.d) return;
      if (m.ap.wrong && !m.ap.wl) { m.ap.wl = true; log('a', '◇ 자동 실습자: 신호를 잘못 해석해 대응 지연'); }
      if (m.ap.shake && !m.ap.shook) { m.ap.shook = true; toggle('shake', true); }
      if (m.phase === 1) applyNeeds(m.def.c1.need);
      else {
        if (m.ap.quit != null && m.prog >= m.sec * m.ap.quit) {
          if (!m.ap.ql) { m.ap.ql = true; log('a', '◇ 자동 실습자: 완료 전에 멈춤'); for (const k of m.def.c2.need) if (!k.includes(':') && k[0] !== '!') toggle(k, false); }
          return;
        }
        if (m.def.c2.need.includes('diaper:new')) { if (m.ap.dOn == null) m.ap.dOn = E.t + rr(5, 15); if (E.t >= m.ap.dOn) applyNeeds(m.def.c2.need); }
        else applyNeeds(m.def.c2.need);
      }
    }

    function tick(dt) {
      if (E.done) return;
      E.t += dt;
      if (E.pose === 'prone' && !activeAlert('flip')) { E.proneT += dt; if (E.proneT >= 20) raise('prone', '엎드린 채 20초 경과'); } else E.proneT = 0;
      for (let i = 0; i < E.queue.length; i++) {
        const q = E.queue[i]; if (q.t > E.t) break;
        const def = EV[q.id];
        if (def.cat === 'safety') { E.queue.splice(i--, 1); raise(def.id); }
        else if (!E.main) { E.queue.splice(i--, 1); startMain(def); }
      }
      if (!E.main && !E.alerts.length) {
        if (E.queue.length) { const nx = E.queue[0].t; if (nx - E.t > 8) { log('', `⏩ 대기 ${fmtT(nx - 3 - E.t)} 건너뜀`); E.t = nx - 3; } }
        else { end(); return; }
      }
      auto();
      const m = E.main;
      if (m) {
        const el = E.t - m.start;
        if (m.phase === 1 && all(m.def.c1.need)) {
          m.t1 = +el.toFixed(1);
          const row = SCORE1.find(r => el <= r.max); m.s1 = row.s; m.g1 = row.g; m.phase = 2;
          log('r', `✓ 1차 조건 충족 — ${m.def.c1.label} · ${m.t1}초 → ${row.g} ${row.s}점`);
          coach('rule', { def: m.def, t1: m.t1, g: row.g, s: row.s });
        } else if (m.phase === 2 && all(m.def.c2.need)) {
          m.prog += dt;
          if (m.prog >= m.sec) finishMain('done');
        }
        if (E.main && el >= m.limit) finishMain(m.phase === 1 ? 'none' : 'partial');
        if (E.main && cfg.mode === 'learn' && !cfg.offline && m.phase === 1) { const th = [12, 25, 40]; while (m.autoH < 3 && el >= th[m.autoH]) hint(true); }
      }
      for (const a of [...E.alerts]) {
        const el = E.t - a.start;
        if (all(a.def.fix)) {
          const g = SAFETY_GRADE.find(x => el <= x.max);
          E.safety.push({ id: a.def.id, name: a.def.name, start: a.start, resp: +el.toFixed(1), grade: g.g, st: g.t });
          E.alerts.splice(E.alerts.indexOf(a), 1); clearEnv(a.def.id);
          log(g.g >= 4 ? 'g' : 's', `✓ ${a.def.name} 처리 ${el.toFixed(1)}초 → 안전 ${g.g}/5 ${g.t}`);
          coach('alertEnd', { def: a.def, g, el });
        } else if (el >= 60) {
          E.safety.push({ id: a.def.id, name: a.def.name, start: a.start, resp: null, grade: 1, st: '미처리' });
          E.alerts.splice(E.alerts.indexOf(a), 1); clearEnv(a.def.id);
          log('s', `✕ ${a.def.name} 미처리 (60초 초과) → 안전 1/5`);
          coach('alertEnd', { def: a.def, g: SAFETY_GRADE[4], el });
        }
      }
    }
    function end() {
      if (E.done) return;
      E.done = true;
      log('r', '■ 과정 종료 — 세션 저장 · AI Report 생성 요청');
      const s = summarize(E);
      cb.end && cb.end(s);
    }
    function stop() {
      if (E.done) return;
      if (E.main) finishMain(E.main.phase === 1 ? 'none' : 'partial');
      for (const a of E.alerts) E.safety.push({ id: a.def.id, name: a.def.name, start: a.start, resp: null, grade: 1, st: '미처리' });
      E.alerts = []; E.queue = [];
      end();
    }
    Object.assign(E, { tick, setPose, toggle, moment, answer, hint, stop, has });
    return E;
  }

  // ---------- 세션 요약 · 지표 산출 ----------
  let sessSeq = 0;
  function summarize(E) {
    const c = E.cfg, evs = E.evs, daily = evs.filter(e => e.cat === 'daily'), emer = evs.filter(e => e.cat === 'emer');
    const base = daily.length ? daily : evs;
    const total = base.length ? Math.round(avg(base.map(e => e.score))) : 0;
    const care = daily.length ? avg(daily.map(e => e.score)) : null;
    const safe = E.safety.length ? clamp(avg(E.safety.map(s => s.grade)) * 20 - E.dangers.length * 4, 0, 100) : (E.dangers.length ? clamp(100 - E.dangers.length * 12, 0, 100) : null);
    const em = emer.length ? avg(emer.map(e => e.score)) : null;
    const parts = [[care, .4], [safe, .35], [em, .25]].filter(p => p[0] != null);
    const wsum = parts.reduce((a, p) => a + p[1], 0);
    const index = parts.length ? parts.reduce((a, p) => a + p[0] * p[1], 0) / wsum : 0;
    const rm = med(E.m.reacts);
    const metrics = {
      react: rm, neck: E.m.lifts ? E.m.neckMiss : null, lifts: E.m.lifts, tilt: E.m.tiltMax, burp: E.m.burpFirst.length ? E.m.burpFirst[0] : null,
      gyro: (evs.some(e => e.id === 'sleep' || e.id === 'colic') || E.m.gyroOver) ? E.m.gyroOver : null, roll: E.m.rollMax,
    };
    const six = {
      '행동 정확도': evs.length ? avg(evs.map(e => e.s2)) * 2 : 0,
      '판단 정확도': E.choices.length ? E.choices.filter(Boolean).length / E.choices.length * 100 : null,
      '대응시간': rm == null ? null : clamp(100 - (rm - 3) * 8, 0, 100),
      '독립 수행': evs.length ? 100 - E.hintEv / evs.length * 100 : 0,
      '위험행동 회피': clamp(100 - E.dangers.length * 20, 0, 100),
      '최종 해결': evs.length ? evs.filter(e => e.res === 'done').length / evs.length * 100 : 0,
    };
    sessSeq++;
    return {
      id: c.label || `S-${String(1000 + sessSeq)}`, user: c.user || 'L-0412', attempt: 1,
      who: c.persona ? PERSONAS[c.persona].name + ' (자동)' : '직접 조작', date: nowStr(), course: COURSES[c.course].name + (c.course === 'single' ? ' · ' + EV[c.single].name : ''),
      mode: c.mode, level: c.level, temper: c.temper, stage: c.stage, offline: !!c.offline, simT: E.t,
      evs, safety: E.safety, dangers: E.dangers, choices: E.choices, hintEv: E.hintEv, metrics, six,
      total, grade: total >= 85 ? 'A' : total >= 75 ? 'B' : total >= 65 ? 'C' : total >= 50 ? 'D' : 'E',
      dailyOK: daily.filter(e => e.res === 'done').length, dailyN: daily.length,
      safeOK: E.safety.filter(s => s.grade >= 4).length, safeN: E.safety.length,
      domain: { care, safe, emer: em }, index: Math.round(index * 10) / 10,
    };
  }
  const MODE_NM = { learn: '학습모드', practice: '실습모드', eval: '평가모드' };
  const STAGE_NM = { 1: 'Coach 1단계 · 텍스트', 2: 'Coach 2단계 · 음성', 3: 'Coach 3단계 · 개인화' };

  function stdRate(k, v) {
    if (v == null) return 'na';
    switch (k) {
      case 'react': return v <= 5 ? 'ok' : v <= 8 ? 'warn' : 'out';
      case 'neck': return v <= 1 ? 'ok' : v <= 2 ? 'warn' : 'out';
      case 'tilt': return v <= 20 ? 'ok' : v <= 25 ? 'warn' : 'out';
      case 'burp': return v >= 10 && v <= 25 ? 'ok' : v < 10 || v <= 35 ? 'warn' : 'out';
      case 'gyro': return v === 0 ? 'ok' : 'out';
      case 'roll': return v <= 15 ? 'ok' : v <= 30 ? 'warn' : 'out';
    }
    return 'na';
  }
  const RATE_TX = { ok: '범위 내', warn: '주의', out: '이탈', na: '미체험' };
  const RATE_CL = { ok: 'pill-ok', warn: 'pill-warn', out: 'pill-bad', na: '' };
  const fmtStd = (k, v) => v == null ? '—' : k === 'gyro' ? (v ? `기준 초과 ${v}회` : '기준 이하') : k === 'neck' ? `${v}회` : k === 'tilt' || k === 'roll' ? `${Math.round(v)}°` : `${r1(v)}초`;

  // 헤드리스로 기본 예시 세션 생성 (보통 실습자 · 체험 데모 · 실습모드)
  function headless(cfg, seed) {
    let out = null;
    const E = Engine({ ...cfg, rand: mulberry(seed) }, { end: s => { out = s; } });
    for (let i = 0; i < 40000 && !out; i++) E.tick(0.5);
    return out;
  }

  // =====================================================================
  //  화면 라우팅
  // =====================================================================
  const renderers = {};
  let curView = 'overview';
  function go(v, opt) {
    curView = v;
    $$('.nav').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    $$('.view').forEach(s => s.classList.toggle('on', s.id === 'v-' + v));
    if (renderers[v]) renderers[v](opt);
    try { history.replaceState(null, '', '#' + v); } catch (e) { /* file:// 등 */ }
    window.scrollTo(0, 0);
  }
  $$('.nav').forEach(b => b.addEventListener('click', () => go(b.dataset.v)));
  document.addEventListener('click', e => { const a = e.target.closest('[data-go]'); if (a) { e.preventDefault(); go(a.dataset.go); } });
  const head = (eb, title, sub, right) => `<div class="vhead"><div><div class="eyebrow">${eb}</div><h1>${title}</h1>${sub ? `<div class="sub">${sub}</div>` : ''}</div>${right ? `<div class="noprint">${right}</div>` : ''}</div>`;

  // =====================================================================
  //  0. 개요 · 아키텍처
  // =====================================================================
  renderers.overview = function () {
    $('#v-overview').innerHTML = `
    <div class="hero">
      <div class="eyebrow" style="color:#8fe9d6">SUNBABY 1.0 → 2.0 → AI 육아돌봄 데이터 플랫폼 · 시연 솔루션</div>
      <h1>아기 로봇의 센서 데이터로<br>한국형 표준 육아돌봄 모델을 만든다</h1>
      <p>썬베이비(HW)가 수집한 돌봄 행동 데이터를 Rule Engine이 판정하고, AI는 그 결과를 <b>해석(AI Report)</b>하고 <b>대화로 코칭(AI Coach)</b>합니다. 축적된 데이터는 표준 모델이 되고, 공공데이터(출산율·지역·출산지원)와 결합해 개인 · 기관 · 지자체 · 중앙부처가 쓰는 플랫폼으로 확장됩니다.</p>
      <div class="tags"><span>센서 13종</span><span>이벤트 18종</span><span>AI Report MVP 7종</span><span>AI Coach 3단계</span><span>공공데이터 5종 연계</span><span>B2G · B2B · B2C</span></div>
      <div style="margin-top:18px;display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn pri" data-demo="auto">▶ 원클릭 시연 (자동 실습자)</button>
        <button class="btn" data-go="sim" style="background:rgba(255,255,255,.1);color:#fff;border-color:rgba(255,255,255,.25)">직접 조작해 보기</button>
      </div>
    </div>

    <div class="grid g3 mt">
      <div class="layer" style="border-top:4px solid var(--red)">
        <div class="lh"><i style="background:var(--red-l)">🤖</i>HW · 썬베이비 AI 시뮬레이터</div>
        <ul><li>신생아형 외관 · 기존 13종 센서 유지</li><li>Rule Engine: 성공/실패 판정 · 시간 측정</li><li>이벤트 18종 · 사운드 19종 · 자세모드 7종</li><li>오프라인에서도 기본 교육 지속</li></ul>
        <div class="mt"><button class="btn sm" data-go="sim">① 시뮬레이터 열기 →</button></div>
      </div>
      <div class="layer" style="border-top:4px solid var(--teal)">
        <div class="lh"><i style="background:var(--teal-l)">🧩</i>플랫폼 · 표준 육아돌봄 모델</div>
        <ul><li>이벤트별 평가기준 표준화 (규칙 R1.0)</li><li>표준 프로파일 S1 (전문가 5인×5회 IMU)</li><li>코호트 · 양육역량지수(K-PCI)</li><li>동의 · 비식별 → 데이터레이크 → 지표엔진</li></ul>
        <div class="mt"><button class="btn sm" data-go="model">③ 표준 모델 보기 →</button></div>
      </div>
      <div class="layer" style="border-top:4px solid var(--navy)">
        <div class="lh"><i style="background:var(--blue-l)">📊</i>SW · 개인화 · 백오피스 · 기관별 현황</div>
        <ul><li>AI Report (개인 해석 리포트 · PDF)</li><li>기관 관리자 백오피스 · 검토 워크플로</li><li>지자체/중앙 대시보드 (CareGraph)</li><li>개인 구독 리포트 · 맞춤 알림 (베이비내비)</li></ul>
        <div class="mt"><button class="btn sm" data-go="office">④ 백오피스 보기 →</button></div>
      </div>
    </div>

    <div class="card mt">
      <div class="ch"><h2>데이터 흐름 — 현장의 한 번의 실습이 지역 정책 지표가 되기까지</h2><span class="tag teal">Rule Engine 판정 · AI는 해석만</span></div>
      ${flowSvg()}
    </div>

    <div class="grid g2 mt">
      <div class="card">
        <h2>시연 시나리오 (약 7분)</h2>
        <div class="grid" style="gap:8px">
          ${[
            ['sim', '시뮬레이터에서 실습', '자동 실습자(보통)로 체험 데모 과정 실행 — 센서 점등, Rule Engine 판정, AI Coach의 질문·힌트·Q&A'],
            ['report', 'AI Report 3대 비교', '① 표준자세 vs 나 ② 코호트 분포 속 나의 위치 ③ 나의 반복 실습(1~4회차) 비교 → AI 해석 · 반복 실수 · 재교육 · PDF'],
            ['model', '표준 모델에 축적', '방금 세션이 비식별되어 데이터레이크·지표엔진에 반영되는 과정과 18종 평가기준'],
            ['office', '기관 백오피스', '검토 대기 → 발행 워크플로, 실습자별 표준자세 이탈 히트맵, 장비·이용권'],
            ['region', '공공데이터 결합', '17개 시·도 → 보령시 드릴다운, 공공데이터 기반 교육과정 자동 추천, 정책 시뮬레이션'],
            ['personal', '개인화 서비스', '부모 앱: 내 약점 복습 + 예방접종·검진 일정 + 지역 출산지원 혜택 맞춤 알림'],
            ['biz', '구독 모델 전환', 'HW 판매(1.0) → AI Report·AI Coach 연 구독(2.0): 제품 3종 기능 구성과 5년 매출 구조 시뮬레이션'],
            ['roadmap', '로드맵 · 고려사항', 'AI Report 3단계 · AI Coach 3단계, 제품·수익, 의사결정 필요 사항'],
          ].map((s, i) => `<div class="step"><b class="n">${i + 1}</b><div class="tx"><div>${s[1]}</div><p>${s[2]}</p></div><button class="btn sm" data-go="${s[0]}">열기</button></div>`).join('')}
        </div>
      </div>
      <div class="card">
        <h2>1.0 → 2.0 무엇이 달라지나</h2>
        <div class="tw"><table class="t">
          <tr><th>구분</th><th>SUNBABY 1.0 (현행)</th><th>SUNBABY 2.0 (본 시뮬레이션)</th></tr>
          <tr><td><b>훈련 방식</b></td><td>아기 울음 → 훈련자 반응 → 결과</td><td>울음 → <b>질문</b> → AI 멘토 답변·힌트 → 반응 → <b>행동 패턴 분석</b></td></tr>
          <tr><td><b>결과지</b></td><td>점수·등급·레이더</td><td>점수 + 코호트 위치 + 표준자세 비교 + 해석 + 재교육 추천</td></tr>
          <tr><td><b>모드</b></td><td>난이도 1~3단계</td><td>학습 · 실습 · 평가 3모드 × 난이도 × 아기 기질(상태모델)</td></tr>
          <tr><td><b>데이터</b></td><td>태블릿 내 저장</td><td>동의·비식별 → 표준모델 · 코호트 · 지역지표</td></tr>
          <tr><td><b>관리</b></td><td>—</td><td>기관 백오피스 · 검토 · 이용권 · Export</td></tr>
          <tr><td><b>확장</b></td><td>기관 실습 중심</td><td>공공데이터 결합 B2G 대시보드 · 개인 구독(B2C)</td></tr>
          <tr><td><b>수익</b></td><td>본체 판매</td><td>본체 + AI 구독 + 교육 + 데이터·플랫폼</td></tr>
        </table></div>
        <p class="note" style="margin-top:8px">※ AI 관련 기능은 개발 계획 단계이며 검증 실적이 아님 (내부보고 2026-09 기준). 본 화면의 수치는 모두 시연용 예시.</p>
      </div>
    </div>`;
    $$('[data-demo]', $('#v-overview')).forEach(b => b.addEventListener('click', () => {
      go('sim');
      Object.assign(SIM.cfg, { course: 'demo', persona: 'normal', mode: 'practice', speed: 10, stage: 1 });
      SIM.syncCtrls(); SIM.start();
    }));
  };
  function flowSvg() {
    const box = (x, y, w, h, t, s, fill, stroke, tc) => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${fill}" stroke="${stroke}"/><text x="${x + w / 2}" y="${y + 24}" text-anchor="middle" font-weight="800" font-size="13" fill="${tc || '#18202e'}">${t}</text><text x="${x + w / 2}" y="${y + 43}" text-anchor="middle" font-size="11" fill="${tc ? '#cfe0f2' : '#6a7487'}">${s}</text></g>`;
    const arr = (x1, y1, x2, y2, l) => `<g><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#13a089" stroke-width="2" marker-end="url(#ah)"/>${l ? `<text x="${(x1 + x2) / 2}" y="${(y1 + y2) / 2 - 6}" text-anchor="middle" font-size="10.5" fill="#0d7a69" font-weight="700">${l}</text>` : ''}</g>`;
    return `<div style="overflow-x:auto"><svg viewBox="0 0 1000 250" style="width:100%;min-width:760px;height:auto" font-family="Pretendard,sans-serif">
      <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="#13a089"/></marker></defs>
      ${box(10, 20, 160, 58, '🤖 아기 로봇', '센서 13종 · 이벤트 감지', '#fcebea', '#f3c6c4')}
      ${box(220, 20, 180, 58, '📱 BabyCareCenter 2.0', 'Rule Engine · 시나리오 엔진', '#fff', '#e3e7ef')}
      ${box(450, 20, 180, 58, '☁️ Cloud AI', 'LLM API · 교육 KB(RAG)', '#e8f0fc', '#c9dbf6')}
      ${box(680, 20, 150, 58, '🧾 AI Report', '개인 해석 · PDF', '#e3f5f1', '#bfe7de')}
      ${box(860, 20, 130, 58, '👩‍🏫 기관', '백오피스 · 검토', '#fff', '#e3e7ef')}
      ${arr(170, 49, 218, 49, 'BT 상태값')}${arr(400, 49, 448, 49, '필요 시 호출')}${arr(630, 49, 678, 49, '')}${arr(830, 49, 858, 49, '')}
      ${box(220, 150, 180, 58, '🔒 동의 · 비식별', '가명 ID · 집계 단위', '#fff', '#e3e7ef')}
      ${box(450, 150, 180, 58, '🧩 표준 육아돌봄 모델', 'R1.0 · S1 · 코호트 · K-PCI', '#13284d', '#13284d', '#fff')}
      ${box(10, 150, 160, 58, '🏛 공공데이터 API', 'KOSIS · 질병청 · 건보 등', '#fbf1de', '#efd6a6')}
      ${box(680, 150, 150, 58, '🗺 CareGraph', '지자체 · 중앙부처', '#e3f5f1', '#bfe7de')}
      ${box(860, 150, 130, 58, '👪 베이비내비', '개인 구독 · 알림', '#fcebea', '#f3c6c4')}
      ${arr(310, 80, 310, 148, '세션 업로드')}${arr(400, 179, 448, 179, '')}${arr(170, 179, 218, 179, '맥락 지표')}${arr(630, 179, 678, 179, '지역 지표')}${arr(830, 179, 858, 179, '')}
      ${arr(540, 148, 540, 80, '')}<text x="548" y="118" font-size="10.5" fill="#0d7a69" font-weight="700">교육과정 · 기준 업데이트</text>
      <text x="500" y="240" text-anchor="middle" font-size="11" fill="#9aa3b3">어떤 AI 개선도 센서 판정을 바꾸지 못한다 · AI 장애 시에도 수업 지속 · 승인된 지식 범위 내 답변 · AI 이용 고지</text>
    </svg></div>`;
  }

  // =====================================================================
  //  1. HW 시뮬레이터 + AI Coach (태블릿)
  // =====================================================================
  const POSE_ROT = { lie: -90, hold: -50, burp: 0, play: -15, prone: -90, upside: 180 };
  const SIM = {
    cfg: { user: 'L-0412', course: 'demo', single: 'feed', mode: 'learn', level: 2, persona: '', speed: 1, stage: 1, temper: 'normal', offline: false },
    eng: null, timer: null, running: false, built: false, lastChoiceEl: null, voice: false,
  };
  renderers.sim = function () { if (!SIM.built) buildSim(); };

  function babySvg() {
    return `<svg id="baby" viewBox="0 0 200 200" aria-label="썬베이비 아기 로봇">
      <g id="bbody">
        <ellipse cx="100" cy="138" rx="46" ry="52" fill="#c62f2f"/>
        <path d="M72 120 Q100 135 128 120 L124 140 Q100 150 76 140 Z" fill="#fff"/>
        <ellipse cx="56" cy="128" rx="13" ry="24" fill="#c62f2f" transform="rotate(25 56 128)"/>
        <ellipse cx="144" cy="128" rx="13" ry="24" fill="#c62f2f" transform="rotate(-25 144 128)"/>
        <circle cx="50" cy="146" r="9" fill="#f4cdb8"/><circle cx="150" cy="146" r="9" fill="#f4cdb8"/>
        <ellipse cx="82" cy="188" rx="13" ry="9" fill="#a82626"/><ellipse cx="118" cy="188" rx="13" ry="9" fill="#a82626"/>
        <circle cx="100" cy="70" r="40" fill="#f6d5c3"/>
        <path d="M60 64 Q62 26 100 24 Q138 26 140 64 Q120 50 100 50 Q80 50 60 64Z" fill="#c62f2f"/>
        <path d="M118 30 q14 -12 22 -2 q-6 10 -22 2z M118 30 q4 -16 16 -12" fill="#fff"/>
        <g id="face">
          <ellipse cx="85" cy="74" rx="4.5" ry="5.5" fill="#2b2b2b" id="eyeL"/><ellipse cx="115" cy="74" rx="4.5" ry="5.5" fill="#2b2b2b" id="eyeR"/>
          <circle cx="76" cy="86" r="5" fill="#f2a9a0" opacity=".6"/><circle cx="124" cy="86" r="5" fill="#f2a9a0" opacity=".6"/>
          <path id="mSmile" d="M92 90 Q100 97 108 90" stroke="#a5523f" stroke-width="2.5" fill="none" stroke-linecap="round"/>
          <ellipse id="mCry" cx="100" cy="93" rx="7" ry="6" fill="#8a3a2e" style="display:none"/>
          <g id="tears" style="display:none"><path d="M80 80 q-3 8 0 12 q3 -4 0 -12z" fill="#7cc4f0"/><path d="M120 80 q-3 8 0 12 q3 -4 0 -12z" fill="#7cc4f0"/></g>
        </g>
        <path id="back" d="M60 70 Q100 110 140 70 Q140 112 100 112 Q60 112 60 70Z" fill="#c62f2f" style="display:none"/>
      </g>
    </svg>`;
  }

  function buildSim() {
    SIM.built = true;
    const v = $('#v-sim');
    const evOpts = EVENTS.filter(e => e.cat !== 'safety').map(e => `<option value="${e.id}">${CAT[e.cat]} · ${e.name}</option>`).join('');
    v.innerHTML = head('① HW · 썬베이비 AI 시뮬레이터', '실습 시뮬레이터 + AI Coach', '아기 로봇의 센서 반응을 가상으로 재현합니다. 버튼은 실습자의 실제 행동(안기·젖병·두드리기 등)이며, Rule Engine이 엑셀 점수표대로 판정합니다.') + `
    <div class="card noprint" style="margin-bottom:14px">
      <div class="ctrl">
        <label class="f">과정<select class="inp" id="cCourse">${Object.entries(COURSES).map(([k, c]) => `<option value="${k}">${c.name}</option>`).join('')}</select></label>
        <label class="f" id="cSingleW" style="display:none">이벤트<select class="inp" id="cSingle">${evOpts}</select></label>
        <label class="f">모드<div class="seg" id="cMode"><button data-v="learn">학습</button><button data-v="practice">실습</button><button data-v="eval">평가</button></div></label>
        <label class="f">난이도<div class="seg" id="cLevel"><button data-v="1">1</button><button data-v="2">2</button><button data-v="3">3</button></div></label>
        <label class="f">실습자 ID<select class="inp" id="cUser"><option value="L-0412">L-0412 (이전 3회 이력)</option><option value="L-0420">L-0420 (신규)</option></select></label>
        <label class="f">조작<select class="inp" id="cPersona"><option value="">직접 조작</option>${Object.entries(PERSONAS).map(([k, p]) => `<option value="${k}">자동 · ${p.name}</option>`).join('')}</select></label>
        <label class="f">속도<div class="seg" id="cSpeed"><button data-v="1">×1</button><button data-v="5">×5</button><button data-v="10">×10</button><button data-v="30">×30</button></div></label>
        <div style="display:flex;gap:6px;margin-left:auto">
          <button class="btn pri" id="bStart">▶ 시작</button>
          <button class="btn" id="bPause" disabled>❚❚ 일시정지</button>
          <button class="btn" id="bStop" disabled>■ 종료</button>
        </div>
      </div>
    </div>
    <div class="simwrap">
      <div class="grid" style="gap:14px">
        <div class="card" style="padding:12px">
          <div class="stage" id="stage">
            <div class="clock num"><span id="clk">0:00</span><small id="clkSub">대기 중 · 시작을 누르세요</small></div>
            <div class="evbadge" id="evBadge"></div>
            <div class="bubble hide" id="bubble"></div>
            ${babySvg()}
            <div id="fxRow" style="position:absolute;left:10px;bottom:10px;display:flex;gap:4px;flex-wrap:wrap;max-width:70%"></div>
            <div id="envRow" style="position:absolute;right:10px;bottom:10px;display:flex;gap:4px"></div>
            <div class="warnbar" id="warnbar"></div>
          </div>
          <div id="phaseBox" style="margin-top:10px"></div>
        </div>
        <div class="card">
          <div class="ch"><h3>실습자 행동 (시뮬레이터 조작)</h3><span class="note">점선 = 위험 행동 · 판정 대상</span></div>
          <div class="poses" id="poseBtns"></div>
          <div class="acts mt" id="actBtns" style="margin-top:8px"></div>
        </div>
        <div class="grid g2">
          <div class="card"><div class="ch"><h3>센서 13종 실시간</h3><span class="note">로봇 → 태블릿 (BT)</span></div><div class="sens" id="sens"></div></div>
          <div class="card"><div class="ch"><h3>Rule Engine 로그</h3><span class="tag navy">R1.0</span></div><div class="log" id="log"></div></div>
        </div>
      </div>
      <div class="tablet">
        <div class="tscreen">
          <div class="tbar"><div>BabyCareCenter 2.0 <small id="tMode">· 학습모드</small></div>
            <label style="display:flex;align-items:center;gap:6px;font-size:11px;font-weight:700;cursor:pointer"><input type="checkbox" id="cOffline"> 오프라인</label></div>
          <div class="coachhead">
            <div class="seg" id="cStage"><button data-v="1">1 텍스트</button><button data-v="2">2 음성</button><button data-v="3">3 개인화</button></div>
            <select class="inp" id="cTemper" title="아기 기질 (상태모델)" style="display:none">${Object.entries(TEMPERAMENTS).map(([k, t]) => `<option value="${k}">기질 · ${t.name}</option>`).join('')}</select>
            <span class="tag teal" id="stageTag">AI 육아 멘토</span>
          </div>
          <div class="chat" id="chat"></div>
          <div class="quick" id="quick">${['트림 안 하면 어떡해요?', '목은 언제까지 받쳐요?', '엎드려 재워도 돼요?', '열이 몇 도면 병원 가요?', '주식 추천해줘'].map(q => `<button>${q}</button>`).join('')}</div>
          <div class="qa"><button class="btn sm" id="bMic" title="음성 질문" style="display:none">🎤</button><button class="btn sm" id="bHint">💡 힌트</button><input class="inp" id="qIn" placeholder="AI 멘토에게 질문하기 (승인된 교육 범위)"><button class="btn sm pri" id="qGo">보내기</button></div>
        </div>
      </div>
    </div>`;

    // 자세·행동 버튼
    $('#poseBtns').innerHTML = Object.entries(POSES).map(([k, p]) => `<button class="act${p.danger ? ' danger' : ''}" data-pose="${k}" style="flex:0 0 auto"><span class="e">${{ lie: '🛏', hold: '🤱', burp: '🧍', play: '🫂', prone: '⬇️', upside: '🙃' }[k]}</span>${p.name}</button>`).join('');
    $('#actBtns').innerHTML = Object.entries(ACTIONS).map(([k, a]) => `<button class="act${a.danger ? ' danger' : ''}" data-act="${k}" title="센서: ${a.sensors.join(', ')}"><span class="e">${a.ico}</span>${a.name}</button>`).join('');
    $('#sens').innerHTML = SENSORS.map(s => `<div class="sen" id="sen-${s.id}"><b>${s.id} · ${s.grp}</b>${s.name}</div>`).join('');
    $('#poseBtns').addEventListener('click', e => { const b = e.target.closest('[data-pose]'); if (b) { ensureEngine(); SIM.eng.setPose(b.dataset.pose); updateSim(); } });
    $('#actBtns').addEventListener('click', e => {
      const b = e.target.closest('[data-act]'); if (!b) return; ensureEngine();
      const k = b.dataset.act; if (ACTIONS[k].kind === 'moment') SIM.eng.moment(k); else SIM.eng.toggle(k); updateSim();
    });

    // 컨트롤
    const segBind = (id, key, num) => $('#' + id).addEventListener('click', e => {
      const b = e.target.closest('button'); if (!b) return;
      SIM.cfg[key] = num ? +b.dataset.v : b.dataset.v; SIM.syncCtrls();
      if (key === 'speed' && SIM.running) restartTimer();
      if (key === 'stage' && SIM.eng) SIM.eng.cfg.stage = SIM.cfg.stage;
      if (key === 'mode' && SIM.eng && !SIM.eng.done) toast('모드 변경은 다음 시작부터 적용됩니다');
    });
    segBind('cMode', 'mode'); segBind('cLevel', 'level', 1); segBind('cSpeed', 'speed', 1); segBind('cStage', 'stage', 1);
    $('#cCourse').addEventListener('change', e => { SIM.cfg.course = e.target.value; SIM.syncCtrls(); });
    $('#cUser').addEventListener('change', e => { SIM.cfg.user = e.target.value; });
    $('#cSingle').addEventListener('change', e => { SIM.cfg.single = e.target.value; });
    $('#cPersona').addEventListener('change', e => { SIM.cfg.persona = e.target.value; if (e.target.value && SIM.cfg.speed === 1) { SIM.cfg.speed = 10; SIM.syncCtrls(); } });
    $('#cTemper').addEventListener('change', e => { SIM.cfg.temper = e.target.value; });
    $('#cOffline').addEventListener('change', e => {
      SIM.cfg.offline = e.target.checked; if (SIM.eng) SIM.eng.cfg.offline = SIM.cfg.offline;
      addMsg('sys', SIM.cfg.offline ? '📴 오프라인 전환 — AI 호출 중단 · 기본 교육(Rule Engine·사전 탑재 안내) 계속 · 세션은 전송 대기' : '📶 온라인 복귀 — AI 멘토 재연결 · 전송 대기 세션 업로드');
    });
    $('#bStart').addEventListener('click', () => SIM.start());
    $('#bPause').addEventListener('click', () => SIM.pause());
    $('#bStop').addEventListener('click', () => { if (SIM.eng && !SIM.eng.done) SIM.eng.stop(); });
    $('#qGo').addEventListener('click', () => ask($('#qIn').value));
    $('#qIn').addEventListener('keydown', e => { if (e.key === 'Enter') ask($('#qIn').value); });
    $('#quick').addEventListener('click', e => { const b = e.target.closest('button'); if (b) ask(b.textContent); });
    $('#bHint').addEventListener('click', () => {
      if (!SIM.eng || !SIM.eng.main) return toast('진행 중인 이벤트가 없습니다');
      if (SIM.cfg.offline) return addMsg('sys', '오프라인 — 사전 탑재 안내: ' + SIM.eng.main.def.c1.label);
      if (SIM.eng.cfg.mode === 'eval') return addMsg('sys', '평가모드에서는 힌트가 제공되지 않습니다');
      SIM.eng.hint(false);
    });
    $('#bMic').addEventListener('click', voiceAsk);
    SIM.syncCtrls();
    addMsg('ai', `안녕하세요, AI 육아 멘토예요. <b>시작</b>을 누르면 아기가 신호를 보내요. 저는 질문과 힌트로 도와드리고, <b>성공·실패 판정은 아기 로봇의 센서(Rule Engine)</b>가 해요.`, '시스템 안내');
    updateSim();
  }

  SIM.syncCtrls = function () {
    if (!SIM.built) return;
    const c = SIM.cfg;
    $('#cUser').value = c.user; $('#cCourse').value = c.course; $('#cSingle').value = c.single; $('#cPersona').value = c.persona; $('#cTemper').value = c.temper;
    $('#cSingleW').style.display = c.course === 'single' ? '' : 'none';
    [['cMode', c.mode], ['cLevel', c.level], ['cSpeed', c.speed], ['cStage', c.stage]].forEach(([id, val]) => $$('#' + id + ' button').forEach(b => b.classList.toggle('on', b.dataset.v == val)));
    $('#cTemper').style.display = c.stage === 3 ? '' : 'none';
    $('#bMic').style.display = c.stage === 2 ? '' : 'none';
    $('#stageTag').textContent = { 1: '선택형 대화 + 텍스트 Q&A', 2: '음성 멘토 (TTS·STT)', 3: '상태모델 · 적응형' }[c.stage];
    $('#tMode').textContent = '· ' + MODE_NM[c.mode] + ' · 난이도 ' + c.level;
    $('#bHint').style.display = c.mode === 'practice' ? '' : 'none';
  };

  function ensureEngine() {
    if (!SIM.eng || SIM.eng.done || !SIM.running) SIM.start();
  }
  function newEngine() {
    $('#log').innerHTML = '';
    SIM.eng = Engine({ ...SIM.cfg }, {
      log: (t, cls, txt) => { const l = $('#log'); const d = document.createElement('div'); d.innerHTML = `<span class="t">${fmtT(t)}</span><span class="${cls}">${esc(txt)}</span>`; l.appendChild(d); if (l.children.length > 400) l.firstChild.remove(); l.scrollTop = l.scrollHeight; },
      coach: onCoach,
      end: onSessionEnd,
    });
    addMsg('sys', `${COURSES[SIM.cfg.course].name} · ${MODE_NM[SIM.cfg.mode]} · 난이도 ${SIM.cfg.level} · ${STAGE_NM[SIM.cfg.stage]}${SIM.cfg.stage === 3 ? ' · 기질 ' + TEMPERAMENTS[SIM.cfg.temper].name : ''}`);
  }
  function restartTimer() {
    clearInterval(SIM.timer);
    SIM.timer = setInterval(() => { if (!SIM.eng) return; SIM.eng.tick(0.1 * SIM.cfg.speed); updateSim(); }, 100);
  }
  SIM.start = function () {
    if (!SIM.built) buildSim();
    if (!SIM.eng || SIM.eng.done) newEngine();
    SIM.running = true; restartTimer();
    $('#bStart').disabled = true; $('#bPause').disabled = false; $('#bStop').disabled = false;
  };
  SIM.pause = function () {
    SIM.running = false; clearInterval(SIM.timer);
    $('#bStart').disabled = false; $('#bStart').textContent = '▶ 계속'; $('#bPause').disabled = true;
  };

  function sensorsOn(E) {
    const on = new Set();
    for (const k in E.act) if (E.act[k]) ACTIONS[k].sensors.forEach(s => on.add(s));
    on.add('S08');
    if (E.pose !== 'lie') on.add('S06');
    if (E.diaper === 'off') on.add('S11');
    if (E.envNoise || E.main || E.alerts.length) on.add('S12');
    if (E.envLight) on.add('S13');
    return on;
  }
  function updateSim() {
    const E = SIM.eng;
    if (!E) {
      $('#phaseBox').innerHTML = `<div class="note">과정을 선택하고 <b>시작</b>을 누르세요. 직접 조작 시 속도 ×1, 자동 실습자는 ×10 이상을 권장합니다.</div>`;
      return;
    }
    $('#clk').textContent = fmtT(E.t);
    $('#clkSub').textContent = E.done ? '과정 종료' : (SIM.running ? `시뮬레이션 시간 · ×${SIM.cfg.speed}` : '일시정지');
    const m = E.main;
    const crying = (m && m.phase === 1) || E.alerts.length > 0;
    const baby = $('#baby');
    const rot = POSE_ROT[E.pose];
    baby.style.transform = `rotate(${rot}deg)`;
    baby.classList.toggle('crying', crying && !E.act.shake);
    baby.classList.toggle('shaking', !!E.act.shake);
    const prone = E.pose === 'prone';
    $('#face').style.display = prone ? 'none' : ''; $('#back').style.display = prone ? '' : 'none';
    $('#mSmile').style.display = crying ? 'none' : ''; $('#mCry').style.display = crying ? '' : 'none'; $('#tears').style.display = crying ? '' : 'none';
    const sleeping = m && m.def.id === 'sleep' && m.phase === 2 && E.pose === 'lie';
    $('#eyeL').setAttribute('ry', sleeping ? 1 : 5.5); $('#eyeR').setAttribute('ry', sleeping ? 1 : 5.5);
    $('#stage').classList.toggle('dark', !!E.act.dim);
    $('#stage').style.boxShadow = E.envLight ? 'inset 0 0 0 999px rgba(255,236,150,.35)' : '';
    // 말풍선
    const bub = $('#bubble');
    if (E.alerts.length) { const a = E.alerts[E.alerts.length - 1].def; bub.className = 'bubble'; bub.textContent = `😭 ${a.signal} · ${a.snd}`; }
    else if (m && m.phase === 1) { bub.className = 'bubble'; bub.textContent = `😢 ${m.def.signal} · ${m.def.snd}`; }
    else if (m && m.phase === 2) { bub.className = 'bubble good'; bub.textContent = '🙂 1차 조건 충족 — 진행 중'; }
    else if (E.lastFx && E.t < E.lastFx.until) { bub.className = 'bubble' + (E.lastFx.good ? ' good' : ''); bub.textContent = (E.lastFx.good ? '😊 ' : '😣 ') + E.lastFx.txt; }
    else bub.className = 'bubble hide';
    // 이벤트 배지
    $('#evBadge').innerHTML = m ? `<span class="tag ${m.def.cat === 'emer' ? 'red' : 'teal'}">${CAT[m.def.cat]}</span><div style="font-weight:900;font-size:16px;margin-top:3px">${m.def.ico} ${m.def.name}</div>` : (E.done ? '<span class="tag navy">종료</span>' : (E.queue.length ? `<span class="tag">다음 · ${EV[E.queue[0].id].name} ${fmtT(Math.max(0, E.queue[0].t - E.t))}</span>` : ''));
    // 활성 행동 칩 / 환경
    $('#fxRow').innerHTML = Object.keys(E.act).filter(k => E.act[k]).map(k => `<span class="tag ${ACTIONS[k].danger ? 'red' : 'teal'}">${ACTIONS[k].ico} ${ACTIONS[k].name}</span>`).join('') + (E.diaper === 'off' ? '<span class="tag amber">🧷 기저귀 뗌</span>' : '');
    $('#envRow').innerHTML = (E.envNoise ? '<span class="tag red">🔊 소음 88dB</span>' : '') + (E.envLight ? '<span class="tag amber">💡 강한 빛</span>' : '') + `<span class="tag">${POSES[E.pose].code}</span>`;
    const wb = $('#warnbar');
    if (E.alerts.length) { wb.classList.add('on'); wb.innerHTML = E.alerts.map(a => `⚠ ${a.def.name} — ${a.def.fixLabel} (${Math.floor(E.t - a.start)}초 경과)`).join(' &nbsp;·&nbsp; '); } else wb.classList.remove('on');
    // 진행 상황
    if (m) {
      const el = E.t - m.start, p2 = clamp(m.prog / m.sec * 100, 0, 100);
      $('#phaseBox').innerHTML = `
        <div style="display:flex;justify-content:space-between;font-size:12.5px;font-weight:800"><span>${m.def.ico} ${m.def.name}</span><span class="num muted">${fmtT(el)} / ${fmtT(m.limit)}</span></div>
        <div class="phase"><span class="tag ${m.phase > 1 ? 'teal' : ''}" style="min-width:52px">1차 ${m.phase > 1 ? '✓ ' + m.g1 : ''}</span><span class="pp">${esc(m.def.c1.label)}</span>${m.phase > 1 ? `<b class="ok num">${m.t1}초 · ${m.s1}점</b>` : `<span class="muted">${condTxt(E, m.def.c1.need)}</span>`}</div>
        <div class="phase"><span class="tag ${m.phase > 1 ? 'teal' : ''}" style="min-width:52px">2차</span><span class="pp">${esc(m.def.c2.label)}${m.def.c2.sec > 1 ? ` · 목표 ${m.sec}초` : ''}</span><span class="num muted">${Math.floor(m.prog)}/${m.sec}초</span></div>
        <div class="bar" style="margin-top:6px"><i style="width:${p2}%"></i></div>`;
    } else if (E.done) {
      $('#phaseBox').innerHTML = `<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><b>과정 종료</b><span class="muted">이벤트 ${E.evs.length}개 · 안전 ${E.safety.length}건 판정</span><button class="btn sm pri" data-go="report">AI Report 보기 →</button><button class="btn sm" id="bAgain">다시 하기</button></div>`;
      const ag = $('#bAgain'); if (ag) ag.onclick = () => { SIM.eng = null; $('#bStart').textContent = '▶ 시작'; SIM.start(); };
    } else $('#phaseBox').innerHTML = `<div class="note">${E.alerts.length ? '⚠ 안전 이벤트에 대응하세요 — ' + E.alerts.map(a => a.def.fixLabel).join(', ') : '다음 이벤트 대기 중 (대기 시간은 자동으로 건너뜁니다)'}</div>`;
    // 버튼 상태
    $$('#poseBtns [data-pose]').forEach(b => b.classList.toggle('on', b.dataset.pose === E.pose));
    $$('#actBtns [data-act]').forEach(b => { const k = b.dataset.act; b.classList.toggle('on', ACTIONS[k].kind === 'toggle' ? !!E.act[k] : (k === 'diaperOff' && E.diaper === 'off')); });
    const on = sensorsOn(E);
    SENSORS.forEach(s => $('#sen-' + s.id).classList.toggle('on', on.has(s.id)));
    if (E.done && SIM.running) { SIM.running = false; clearInterval(SIM.timer); $('#bStart').disabled = false; $('#bStart').textContent = '▶ 새로 시작'; $('#bPause').disabled = true; $('#bStop').disabled = true; }
  }
  function condTxt(E, need) {
    return need.map(k => {
      const ok = E.has(k);
      const nm = k.startsWith('pose:') ? POSES[k.slice(5)].name : k === 'diaper:off' ? '기저귀 떼기' : k === 'diaper:new' ? '새 기저귀' : k[0] === '!' ? ACTIONS[k.slice(1)].name + ' 중지' : ACTIONS[k].name;
      return `<span class="${ok ? 'ok' : ''}">${ok ? '✓' : '○'} ${nm}</span>`;
    }).join(' ');
  }

  // ----- 태블릿 대화 -----
  function addMsg(kind, html, who) {
    const c = $('#chat'); if (!c) return null;
    const d = document.createElement('div'); d.className = 'msg ' + kind;
    d.innerHTML = kind === 'ai' ? `<div class="who">${who || 'AI 육아 멘토'} · <span style="color:var(--faint);font-weight:600">AI 생성 · 교육 보조</span></div>${html}` : html;
    c.appendChild(d); c.scrollTop = c.scrollHeight;
    if (kind === 'ai' && SIM.cfg.stage === 2 && !SIM.cfg.offline) speak(d.textContent.replace(/^.*?교육 보조/, ''));
    return d;
  }
  function speak(t) {
    try {
      if (!('speechSynthesis' in window) || SIM.cfg.speed > 5) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(t.slice(0, 160)); u.lang = 'ko-KR'; u.rate = 1.1; speechSynthesis.speak(u);
    } catch (e) { /* 음성 미지원 */ }
  }
  function aiOn() { return SIM.eng && !SIM.eng.cfg.offline && SIM.eng.cfg.mode !== 'eval'; }
  function onCoach(type, p) {
    const E = SIM.eng, mode = E.cfg.mode;
    if (type === 'rule') { addMsg('rule', `<b>Rule Engine 판정</b> · ${esc(p.def.name)} 1차 조건 충족 ${p.t1}초 → <b>${p.g} ${p.s}점</b> <span style="opacity:.7">(센서 판정 · AI 개입 없음)</span>`); return; }
    if (type === 'alert') {
      if (E.cfg.offline) addMsg('sys', `⚠ ${p.def.name} — 사전 탑재 안내: ${p.def.fixLabel}`);
      else if (mode === 'eval') addMsg('sys', `⚠ 안전 이벤트 발생 · ${p.def.name} (평가모드 — 힌트 없음)`);
      else addMsg('ai', `⚠ <b>${esc(p.def.name)}</b> — ${esc(p.def.coach.h[0])}`, '안전 알림');
      return;
    }
    if (type === 'alertEnd') { if (aiOn()) addMsg('sys', `${p.def.name} 처리 ${p.g.t} · ${p.g.g}/5`); return; }
    if (type === 'start') {
      const def = p.def;
      if (E.cfg.offline) { addMsg('sys', `${def.ico} ${def.name} — 오프라인 기본 안내: ${def.c1.label} → ${def.c2.label}`); return; }
      if (mode === 'eval') { addMsg('sys', `${def.ico} ${def.name} 시작 · 평가모드 — 질문·힌트 없음, 종료 후 분석`); return; }
      const d = addMsg('ai', `${def.ico} <b>${esc(def.coach.q)}</b><div class="choices">${def.coach.ch.map((c, i) => `<button data-i="${i}">${esc(c.t)}</button>`).join('')}</div>`, mode === 'learn' ? 'AI 육아 멘토 · 학습모드' : 'AI 육아 멘토 · 실습모드');
      SIM.lastChoiceEl = d;
      d.querySelector('.choices').addEventListener('click', e => { const b = e.target.closest('button'); if (b) pickChoice(d, +b.dataset.i); });
      return;
    }
    if (type === 'autoAnswer') { if (SIM.lastChoiceEl) renderChoice(SIM.lastChoiceEl, p.idx, p.ok); return; }
    if (type === 'hint') { if (!E.cfg.offline) addMsg('ai', `💡 <b>힌트 ${p.i + 1}단계</b> · ${esc(p.text)}`, p.auto ? 'AI 육아 멘토 · 단계별 힌트' : 'AI 육아 멘토 · 요청 힌트'); return; }
    if (type === 'end') {
      const { def, rec } = p;
      if (!aiOn()) { addMsg('sys', `${def.name} 종료 · ${rec.score}점 (${SCORE2[rec.res].t})`); return; }
      let t;
      if (rec.res === 'done') {
        t = `잘했어요! <b>${def.name}</b> 완료 — 1차 ${rec.t1}초(${rec.g1}), 총 ${rec.score}점.`;
        if (def.id === 'burp' && rec.firstPat != null) t += ` 첫 두드림 ${rec.firstPat}초 — 표준 10~25초 ${rec.firstPat <= 25 ? '안이에요.' : '보다 늦었어요. 수유가 끝나면 바로 어깨에 세워 안아요.'}`;
        else if (rec.react != null && rec.react > 5) t += ` 다만 첫 반응까지 ${rec.react}초 걸렸어요(표준 2~5초).`;
      } else if (rec.res === 'partial') t = `거의 다 왔어요. 1차는 성공(${rec.g1})했지만 <b>${def.c2.label}</b>까지 이어가야 완료돼요. (${rec.score}점)`;
      else t = `<b>${def.name}</b> 신호를 놓쳤어요. 다음엔 '${def.signal}' 소리가 나면 <b>${def.c1.label}</b>부터 해 보세요.`;
      addMsg('ai', t, 'AI 육아 멘토 · 피드백');
      return;
    }
    if (type === 'adapt') {
      const { rec } = p; const c = SIM.eng.cfg;
      let msg;
      if (rec.score < 60) msg = `📉 <b>${rec.name}</b> ${rec.score}점 — 상태모델이 다음 같은 이벤트를 <b>학습모드 · 난이도 ${Math.max(1, c.level - 1)}</b>로 낮춰 다시 제안해요.`;
      else if (rec.score >= 90) msg = `📈 <b>${rec.name}</b> ${rec.score}점 — 다음엔 <b>${TEMPERAMENTS.sensitive.name}</b> 기질 · 난이도 ${Math.min(3, c.level + 1)}로 도전해 보세요.`;
      else msg = `🧭 <b>${rec.name}</b> ${rec.score}점 — 현재 난이도를 유지해요. 기질 '${TEMPERAMENTS[c.temper].name}': ${TEMPERAMENTS[c.temper].desc}.`;
      addMsg('ai', msg, 'Coach 3단계 · 적응형');
    }
  }
  function pickChoice(d, i) {
    if (!SIM.eng) return;
    const ok = SIM.eng.answer(i); if (ok == null) return;
    renderChoice(d, i, ok);
  }
  function renderChoice(d, i, ok) {
    const btns = $$('.choices button', d); btns.forEach(b => b.disabled = true);
    btns[i].classList.add(ok ? 'right' : 'wrong');
    const def = SIM.eng.main && SIM.eng.main.def; if (!def) return;
    const rightIdx = def.coach.ch.findIndex(c => c.ok);
    if (!ok) btns[rightIdx].classList.add('right');
    if (SIM.eng.cfg.mode === 'learn') addMsg('ai', ok ? `맞아요! 이제 행동으로 옮겨 볼까요? → <b>${esc(def.c1.label)}</b>` : `아쉬워요. 정답은 '<b>${esc(def.coach.ch[rightIdx].t)}</b>'예요. → ${esc(def.c1.label)}`, 'AI 육아 멘토 · 설명');
    else addMsg('ai', ok ? '좋아요. 직접 해 보세요.' : '다시 생각해 보세요. 아기의 신호를 잘 들어 보세요.', 'AI 육아 멘토');
  }
  function kbAnswer(q) {
    const s = q.toLowerCase(); let best = null, bs = 0;
    for (const k of KB) { const sc = k.k.filter(w => s.includes(w)).length; if (sc > bs) { bs = sc; best = k; } }
    return best;
  }
  function ask(q) {
    q = (q || '').trim(); if (!q) return; $('#qIn').value = '';
    if (!SIM.built) return;
    addMsg('me', esc(q));
    if (SIM.cfg.offline) return addMsg('sys', '오프라인 — 질의응답은 연결 후 사용할 수 있어요. 기본 교육은 계속됩니다.');
    if (SIM.eng && !SIM.eng.done && SIM.eng.cfg.mode === 'eval') return addMsg('sys', '평가모드에서는 질의응답이 제한됩니다.');
    const hit = kbAnswer(q);
    setTimeout(() => {
      if (hit) addMsg('ai', `${esc(hit.a)}<span class="src">근거: ${esc(hit.src)} · RAG 범위 내 답변</span>`);
      else addMsg('ai', `그 질문은 <b>승인된 교육 콘텐츠 범위 밖</b>이라 답변하지 않아요. 육아·돌봄·안전 관련 질문을 해 주세요.<span class="src">범위 제한 RAG · 차단 로그 기록</span>`);
      store.lake.records += 3; lakeTxt();
    }, 350);
  }
  function voiceAsk() {
    const Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Rec) {
      try {
        const r = new Rec(); r.lang = 'ko-KR'; r.interimResults = false;
        addMsg('sys', '🎤 듣는 중… (태블릿 마이크)');
        r.onresult = e => ask(e.results[0][0].transcript);
        r.onerror = () => simulatedVoice();
        r.start(); return;
      } catch (e) { /* fallthrough */ }
    }
    simulatedVoice();
  }
  function simulatedVoice() {
    const qs = ['트림을 안 하면 어떻게 해요?', '아기가 계속 울어요 배앓이인가요?', '목은 언제까지 받쳐야 해요?'];
    const q = qs[Math.floor(Math.random() * qs.length)];
    addMsg('sys', '🎤 음성 인식(시뮬레이션) — 소음·지연 검증 항목');
    ask(q);
  }
  function onSessionEnd(s) {
    s.attempt = allSessions().filter(x => x.user === s.user).length + 1;
    store.sessions.push(s); store.current = s;
    store.lake.sessions++; store.lake.events += s.evs.length + s.safety.length; store.lake.records += Math.round(s.simT * 13 * 2);
    lakeTxt();
    if (s.offline) addMsg('sys', '세션 저장 — 오프라인이므로 전송 대기 (1.0 Report만 제공 중)');
    const d = addMsg('ai', `과정이 끝났어요. 종합 <b>${s.total}점 (${s.grade})</b> · 일상돌봄 ${s.dailyOK}/${s.dailyN} · 안전 정상처리 ${s.safeOK}/${s.safeN}. 판정 근거와 해석은 AI Report에서 확인하세요.<div class="choices"><button data-go="report">🧾 AI Report 열기</button></div>`, 'AI 육아 멘토 · 요약');
    toast(`세션 ${s.id} 저장 → AI Report 생성 · 데이터레이크 반영`);
    updateSim();
  }

  // =====================================================================
  //  2. AI Report
  // =====================================================================
  renderers.report = function () {
    const all = allSessions();
    const s = store.current || store.base;
    const v = $('#v-report');
    v.innerHTML = head('② SW · AI 구독 서비스', 'AI Report — 표준 · 코호트 · 나의 반복 실습 3대 비교', '실습이 끝나면 Rule Engine 판정값(불변)을 근거로 ① 표준자세 ② 같은 조건 코호트 ③ 나의 이전 실습과 비교해 해석·재교육을 제안합니다.',
      `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center"><div class="seg" id="repTier"><button data-t="basic" class="${store.tier === 'basic' ? 'on' : ''}">BASIC (1.0)</button><button data-t="ai" class="${store.tier === 'ai' ? 'on' : ''}">AI 구독 (2.0)</button></div><select class="inp" id="repSel">${all.map((x, i) => `<option value="${i}" ${x === s ? 'selected' : ''}>${x.user} · ${x.attempt}회차 · ${x.id} · ${x.who}</option>`).join('')}</select><button class="btn" id="repPrint">⎙ PDF 결과보고서</button></div>`) + reportHtml(s);
    $('#repSel').addEventListener('change', e => { store.current = all[+e.target.value]; renderers.report(); });
    $('#repPrint').addEventListener('click', () => window.print());
    $$('#repTier button').forEach(b => b.addEventListener('click', () => { store.tier = b.dataset.t; renderers.report(); }));
  };

  // ---------- 표준·코호트·반복 비교 도구 ----------
  const AX = { react: 20, neck: 5, tilt: 50, burp: 80, gyro: 3, roll: 60 };
  const STD_V = { react: 3, neck: 0, tilt: 10, burp: 15, gyro: 0, roll: 0 };
  const SHORT = { react: '울음 반응시간', neck: '목 지지', tilt: '머리 기울기', burp: '트림 첫 두드림', gyro: '달래기 각속도', roll: '수면 자세(롤)' };
  const UNIT = k => k === 'tilt' || k === 'roll' ? '°' : k === 'neck' || k === 'gyro' ? '회' : '초';
  // 표준 허용범위 밖으로 벗어난 거리 (0 = 범위 내)
  function devOf(k, v) { if (v == null) return null; const r = STD.find(x => x.k === k); const hi = k === 'gyro' ? 0 : r.hi; return v < r.lo ? r.lo - v : v > hi ? v - hi : 0; }
  // 같은 조건 코호트 · 자세 지표별 분포 (C-2026-Q3 · 시연용 합성)
  const COHORT_M = (() => {
    const R = mulberry(19), gen = (n, f) => Array.from({ length: n }, f).sort((a, b) => a - b);
    return {
      react: gen(228, () => clamp(+Math.exp(Math.log(4) + gauss(R) * 0.45).toFixed(1), 1, 20)),
      neck: gen(240, () => { const u = R(); return u < .55 ? 0 : u < .8 ? 1 : u < .92 ? 2 : u < .98 ? 3 : 4; }),
      tilt: gen(240, () => clamp(Math.round(15 + gauss(R) * 8), 3, 45)),
      burp: gen(180, () => clamp(Math.round(28 + gauss(R) * 11), 6, 80)),
      gyro: gen(240, () => { const u = R(); return u < .9 ? 0 : u < .98 ? 1 : 2; }),
      roll: gen(240, () => clamp(Math.round(Math.abs(8 + gauss(R) * 6)), 0, 60)),
    };
  })();
  // 나보다 표준에 가까운 교육생 비율(%) → '상위 x%'
  function cohortPos(k, v) {
    const a = COHORT_M[k]; if (v == null) return null;
    const d = devOf(k, v), better = a.filter(x => devOf(k, x) < d).length, same = a.filter(x => devOf(k, x) === d).length;
    return { top: clamp(Math.round((better + same / 2) / a.length * 100), 1, 99), med: med(a), n: a.length, inStd: Math.round(a.filter(x => devOf(k, x) === 0).length / a.length * 100) };
  }
  const posTxt = t => t <= 50 ? `상위 ${t}%` : `하위 ${100 - t + 1}%`;
  const RATE_COL = { ok: '#1f8a5b', warn: '#b9791a', out: '#c33b36', na: '#9aa3b3' };
  function bulletSvg(k, v) {
    const r = STD.find(x => x.k === k), W = 300, H = 40, x = val => 8 + clamp(val, 0, AX[k]) / AX[k] * (W - 16);
    const hi = k === 'gyro' ? 0 : r.hi, rate = stdRate(k, v);
    let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:300px;height:auto;display:block" font-family="Pretendard,sans-serif">`;
    s += `<rect x="8" y="14" width="${W - 16}" height="10" rx="5" fill="#eef1f6"/>`;
    if (k !== 'gyro') s += `<rect x="${x(hi)}" y="14" width="${Math.max(2, x(r.warn) - x(hi))}" height="10" fill="#fbf1de"/>`;
    s += `<rect x="${x(r.lo)}" y="14" width="${Math.max(4, x(hi) - x(r.lo))}" height="10" rx="3" fill="#cdebd9"/>`;
    s += `<line x1="${x(STD_V[k])}" y1="10" x2="${x(STD_V[k])}" y2="28" stroke="#1f8a5b" stroke-width="2"/><text x="${x(STD_V[k])}" y="8" text-anchor="middle" font-size="9" fill="#1f8a5b">표준</text>`;
    if (v != null) s += `<path d="M${x(v)} 26 l-5 8 h10z" fill="${RATE_COL[rate]}"/><text x="${clamp(x(v), 14, W - 14)}" y="${H - 1}" text-anchor="middle" font-size="9.5" font-weight="800" fill="${RATE_COL[rate]}">나 ${fmtStd(k, v)}</text>`;
    else s += `<text x="${W / 2}" y="${H - 2}" text-anchor="middle" font-size="9.5" fill="#9aa3b3">미체험</text>`;
    return s + '</svg>';
  }
  function stripSvg(k, v) {
    const a = COHORT_M[k], r = STD.find(x => x.k === k), W = 300, H = 54, bins = 20, mx = AX[k], bw = mx / bins, x = val => 8 + clamp(val, 0, mx) / mx * (W - 16);
    const cnt = Array(bins).fill(0); a.forEach(val => cnt[Math.min(bins - 1, Math.floor(val / bw))]++);
    const top = Math.max(...cnt), hi = k === 'gyro' ? 0.4 : r.hi, m = med(a);
    let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;max-width:300px;height:auto;display:block" font-family="Pretendard,sans-serif">`;
    s += `<rect x="${x(r.lo)}" y="4" width="${Math.max(4, x(hi) - x(r.lo))}" height="${H - 18}" fill="#e3f3ea"/>`;
    cnt.forEach((c, i) => { const h = c / top * (H - 22); s += `<rect x="${8 + i * (W - 16) / bins + 1}" y="${H - 14 - h}" width="${(W - 16) / bins - 2}" height="${h}" rx="1.5" fill="#c9d3e3"/>`; });
    s += `<line x1="${x(m)}" y1="2" x2="${x(m)}" y2="${H - 14}" stroke="#6a7487" stroke-dasharray="3 2"/><text x="${x(m) + 3}" y="10" font-size="9" fill="#6a7487">중앙값 ${fmtStd(k, m)}</text>`;
    if (v != null) s += `<line x1="${x(v)}" y1="2" x2="${x(v)}" y2="${H - 14}" stroke="#d13b3b" stroke-width="2.5"/><circle cx="${x(v)}" cy="${H - 14}" r="4" fill="#d13b3b"/>`;
    s += `<text x="8" y="${H - 2}" font-size="9" fill="#9aa3b3">0</text><text x="${W - 8}" y="${H - 2}" text-anchor="end" font-size="9" fill="#9aa3b3">${mx}${UNIT(k)}</text>`;
    return s + '</svg>';
  }
  function trendSvg(H, keyFn, opts) {
    const W = 520, Ht = 150, p = 30, n = H.length, xs = i => n === 1 ? W / 2 : p + i * (W - p * 2) / (n - 1);
    const lo = opts.lo, hi = opts.hi, y = v => Ht - 24 - (clamp(v, lo, hi) - lo) / (hi - lo) * (Ht - 44);
    let s = `<svg viewBox="0 0 ${W} ${Ht}" style="width:100%;height:auto" font-family="Pretendard,sans-serif">`;
    [lo, (lo + hi) / 2, hi].forEach(v => { s += `<line x1="${p}" x2="${W - p}" y1="${y(v)}" y2="${y(v)}" stroke="#eef1f6"/><text x="${p - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#9aa3b3">${Math.round(v)}</text>`; });
    if (opts.band) s += `<rect x="${p}" y="${y(opts.band[1])}" width="${W - p * 2}" height="${y(opts.band[0]) - y(opts.band[1])}" fill="#e3f3ea"/>`;
    opts.series.forEach(se => {
      const pts = H.map((h, i) => [xs(i), se.f(h)]).filter(q => q[1] != null);
      if (pts.length > 1) s += `<polyline points="${pts.map(q => q[0] + ',' + y(q[1])).join(' ')}" fill="none" stroke="${se.c}" stroke-width="2.5"/>`;
      pts.forEach((q, i) => { s += `<circle cx="${q[0]}" cy="${y(q[1])}" r="${i === pts.length - 1 ? 5.5 : 4}" fill="${se.c}"/><text x="${q[0]}" y="${y(q[1]) - 9}" text-anchor="middle" font-size="10.5" font-weight="800" fill="${se.c}">${Math.round(q[1] * 10) / 10}</text>`; });
    });
    H.forEach((h, i) => { s += `<text x="${xs(i)}" y="${Ht - 6}" text-anchor="middle" font-size="10.5" fill="${i === n - 1 ? '#d13b3b' : '#6a7487'}" font-weight="${i === n - 1 ? 800 : 500}">${h.attempt}회차${i === n - 1 ? ' (현재)' : ''}</text>`; });
    s += opts.series.map((se, i) => `<text x="${W - p - i * 90}" y="12" text-anchor="end" font-size="10.5" fill="${se.c}" font-weight="700">● ${se.n}</text>`).join('');
    return s + '</svg>';
  }
  const KS = ['react', 'neck', 'tilt', 'burp', 'gyro', 'roll'];
  const SAFE_K = k => STD.find(x => x.k === k).safety;

  function reportHtml(s) {
    const M = s.metrics, cm = med(COHORT), pc = pctile(s.total);
    const rows = KS.map(k => ({ ...STD.find(x => x.k === k), v: M[k], rate: stdRate(k, M[k]), dev: devOf(k, M[k]), pos: cohortPos(k, M[k]) }));
    const issues = rows.filter(r => r.rate === 'out' || r.rate === 'warn');
    const hist = allSessions().filter(x => x.user === s.user && x.attempt <= s.attempt).sort((a, b) => a.attempt - b.attempt);
    const first = hist[0], prev = hist.length > 1 ? hist[hist.length - 2] : null;
    // 반복 실수: 이번 포함 2회 이상 주의/이탈
    const persistent = KS.filter(k => hist.filter(h => ['warn', 'out'].includes(stdRate(k, h.metrics[k]))).length >= 2 && ['warn', 'out'].includes(stdRate(k, M[k])));
    const trendOf = k => { if (!prev) return null; const a = devOf(k, prev.metrics[k]), b = devOf(k, M[k]); if (a == null || b == null) return null; return b < a ? 'up' : b > a ? 'down' : (b === 0 ? 'keep' : 'same'); };
    const TR = { up: ['▲ 개선', 'ok'], down: ['▼ 악화', 'bad'], keep: ['● 유지(범위 내)', 'ok'], same: ['■ 변화 없음', 'warn'] };
    const improved = KS.filter(k => trendOf(k) === 'up'), worse = KS.filter(k => trendOf(k) === 'down');
    // 우선 보완: 반복 실수(안전) > 안전 이탈 > 반복 실수 > 나머지
    const prioScore = r => (persistent.includes(r.k) ? 4 : 0) + (r.safety ? 2 : 0) + (r.rate === 'out' ? 1 : 0);
    const prio = [...issues].sort((a, b) => prioScore(b) - prioScore(a));
    const REC = {
      neck: ['목 지지와 자세 변경 연결 실습', 15, '시범 5분 + 인형 연결 동작 10분'], tilt: ['목 지지와 자세 변경 연결 실습', 15, '시범 5분 + 인형 연결 동작 10분'],
      burp: ['수유 종료부터 트림까지 이어서', 10, '힌트 없이 순서대로 완료하기'], react: ['울음 신호 구분 훈련 (사운드 7종)', 10, '소리 듣고 원인 고르기 + 즉시 반응'],
      gyro: ['흔들린아이증후군 예방 · 달래기', 10, '각속도 피드백으로 작고 느리게'], roll: ['안전수면 자세', 10, '바로 눕히기 · 침구 정리 체크리스트'],
    };
    const recs = []; const seen = new Set();
    for (const r of prio) { const x = REC[r.k]; if (x && !seen.has(x[0])) { seen.add(x[0]); recs.push([...x, persistent.includes(r.k) ? 'AI Coach 학습모드로 배정' : 'AI Coach 실습모드']); } }
    recs.splice(2); recs.push(['도움 없는 확인 평가', 15, '평가모드 10분 + 교사 확인 5분', '다음 회차 비교 기준']);
    const simN = 12 + store.sessions.filter(x => (x.metrics.neck || 0) > 1).length;
    const evRows = s.evs.map(e => `<tr><td>${EV[e.id].ico} ${e.name}</td><td class="num">${e.t1 == null ? '—' : e.t1 + '초'}</td><td><b>${e.g1}</b> ${e.s1}</td><td><b>${e.g2}</b> ${e.s2}</td><td class="num"><b>${e.score}</b></td><td>${e.hints ? '💡' + e.hints : '—'}</td></tr>`).join('');
    const sfTxt = s.safety.map(x => `${x.name} ${x.grade}/5`).join(' · ');
    const locked = store.tier === 'basic';
    const lockCard = `<div class="rsec"><div class="card" style="text-align:center;padding:28px;background:repeating-linear-gradient(135deg,#fafbfd,#fafbfd 10px,#f3f5f9 10px,#f3f5f9 20px)">
      <div style="font-size:28px">🔒</div><h2 style="margin:6px 0">AI 구독(2.0)에서 제공되는 분석</h2>
      <p class="muted" style="font-size:13px">① 표준자세 vs 나의 자세 · ② 코호트 분포 속 나의 위치 · ③ 나의 반복 실습 비교 · AI 해석 · 맞춤 재교육 · AI Coach 연동</p>
      <p class="note" style="margin-top:6px">BASIC은 1.0 결과지(점수·등급)만 제공 · 판정값은 동일 · 데이터는 축적되어 구독 전환 즉시 과거 회차 비교 가능</p>
      <button class="btn pri" style="margin-top:12px" id="unlockBtn">AI 구독으로 보기</button> <button class="btn" data-go="biz" style="margin-top:12px">구독 모델 보기 →</button></div></div>`;

    const html = `
    <div class="rep" id="repDoc">
      <div class="rh"><span>SUNBABY 2.0 · AI REPORT · ${locked ? 'BASIC (1.0 결과지)' : 'AI 구독'}</span><span>가상 예시 · 실측 결과 아님</span></div>
      <h1>AI 돌봄 훈련 분석 리포트</h1>
      <div class="meta"><div><span>실습자</span>${esc(s.user)} (가명) · <b>${s.attempt}회차</b></div><div><span>세션</span>${esc(s.id)} · ${esc(s.date)}</div><div><span>과정</span>${esc(s.course)}</div><div><span>판정 규칙 · 비교 기준</span>R1.0 · 표준 S1 · 코호트 C-2026-Q3</div></div>

      <div class="rsec"><h2><span class="no">0</span>이번 실습 결과 <span class="note" style="font-weight:600">Rule Engine 판정 · 1.0 결과지와 동일 · AI가 바꾸지 않음</span></h2>
        <div class="grid" style="grid-template-columns:1.4fr 1fr;gap:14px;align-items:start">
          <div>
            <div class="grid g3">
              <div class="kpi"><div class="l">종합점수</div><div class="big num">${s.total}<small style="font-size:14px;color:var(--muted)"> 점 · ${s.grade}</small></div></div>
              <div class="kpi"><div class="l">일상돌봄 성공</div><div class="v num">${s.dailyOK}/${s.dailyN}</div><div class="d">안전 ${sfTxt || '—'}</div></div>
              <div class="kpi"><div class="l">양육역량지수</div><div class="v num" style="color:var(--teal-d)">${s.index}</div><div class="d">K-PCI</div></div>
            </div>
            <div class="tw" style="margin-top:10px"><table class="t"><tr><th>이벤트</th><th>1차 완수</th><th>1차</th><th>2차</th><th>점수</th><th>힌트</th></tr>${evRows}</table></div>
          </div>
          <div class="card" style="padding:12px"><h3 style="margin-bottom:2px">종합평가 요소 6가지</h3>${radarSvg(s.six)}</div>
        </div>
      </div>
      ${locked ? lockCard : `
      <div class="rsec"><h2><span class="no">1</span>표준자세 vs 나의 자세</h2>
        <div class="note">표준 프로파일 S1 (전문가 5인 × 5회 수행) · 인형 IMU(가속도·각속도·자세) · 초록 = 허용범위, 노랑 = 주의</div>
        <div class="tw" style="margin-top:8px"><table class="t"><tr><th>과제 · 측정항목</th><th>표준 (허용범위)</th><th style="min-width:230px">표준 대비 나의 위치</th><th>표준과의 차이</th><th>판정</th></tr>
          ${rows.map(r => `<tr><td><b>${r.task}</b>${r.safety ? ' <span class="tag red">안전</span>' : ''}<div class="note">${r.sensor}</div></td><td>${r.std}<div class="note">${r.k === 'gyro' ? '기준 이하' : r.lo + '~' + r.hi + r.unit}</div></td><td>${bulletSvg(r.k, r.v)}</td><td class="num">${r.v == null ? '—' : r.dev === 0 ? '<span class="ok">범위 안</span>' : `<b class="${r.rate === 'out' ? 'bad' : 'warn'}">+${r1(r.dev)}${UNIT(r.k)}</b> 초과`}${r.k === 'neck' && M.lifts ? `<div class="note">들어올림 ${M.lifts}회 중</div>` : ''}</td><td><span class="tag ${RATE_CL[r.rate]}">${RATE_TX[r.rate]}</span></td></tr>`).join('')}
        </table></div>
        <p class="note" style="margin-top:6px">범위 내 ${rows.filter(r => r.rate === 'ok').length} · 주의 ${rows.filter(r => r.rate === 'warn').length} · 이탈 ${rows.filter(r => r.rate === 'out').length} · 미체험 ${rows.filter(r => r.rate === 'na').length} (미체험은 0점 아님)</p>
      </div>

      <div class="rsec"><h2><span class="no">2</span>코호트 자세 분포 vs 나의 위치</h2>
        <div class="note">같은 과정·시나리오·난이도·규칙 버전의 첫 체험자 · C-2026-Q3 · 사용자별 1세션 · 초록 = 표준 허용범위 · 빨간 선 = 나 (시연용 합성 분포)</div>
        <div class="grid g3" style="margin-top:10px">
          ${rows.map(r => `<div class="card" style="padding:12px;box-shadow:none"><div style="display:flex;justify-content:space-between;gap:6px;align-items:baseline"><b style="font-size:13px">${SHORT[r.k]}</b>${r.pos ? `<span class="tag ${r.pos.top <= 30 ? 'pill-ok' : r.pos.top <= 70 ? '' : 'pill-bad'}">${posTxt(r.pos.top)}</span>` : '<span class="tag">미체험</span>'}</div>${stripSvg(r.k, r.v)}<div class="note">나 ${fmtStd(r.k, r.v)} · 중앙값 ${fmtStd(r.k, med(COHORT_M[r.k]))} · 표준 충족 ${cohortPos(r.k, 0) ? cohortPos(r.k, STD_V[r.k]).inStd : '—'}% · n=${COHORT_M[r.k].length}</div></div>`).join('')}
        </div>
        <div class="grid" style="grid-template-columns:2fr 1fr;gap:14px;margin-top:12px;align-items:center">
          <div>${histSvg(COHORT, s.total, null)}</div>
          <div class="kpi card" style="padding:12px"><div class="l">종합점수 백분위</div><div class="v num">${pc}</div><div class="d">중앙값 ${cm}점 · 가운데 50% ${COHORT[60]}~${COHORT[180]}점 · n=240</div></div>
        </div>
      </div>

      <div class="rsec"><h2><span class="no">3</span>나의 반복 실습 vs 이번 실습 <span class="tag ${hist.length > 1 ? 'teal' : 'amber'}">${hist.length}회차 누적</span></h2>
        ${hist.length < 2 ? `<div class="card" style="padding:14px;box-shadow:none">첫 실습입니다. 이번 결과가 <b>나의 기준선</b>이 되며, 다음 실습부터 회차별 변화와 반복 실수를 비교합니다.</div>` : `
        <div class="grid g2" style="align-items:start">
          <div class="card" style="padding:12px;box-shadow:none"><h3 style="margin-bottom:2px">종합점수 · 양육역량지수 추이</h3>${trendSvg(hist, null, { lo: 40, hi: 100, series: [{ n: '종합점수', c: '#13284d', f: h => h.total }, { n: 'K-PCI', c: '#13a089', f: h => h.index }] })}
            <p style="font-size:12.5px">1회차 대비 종합 <b class="${s.total >= first.total ? 'ok' : 'bad'}">${s.total - first.total >= 0 ? '+' : ''}${s.total - first.total}점</b> · 직전 대비 <b class="${s.total >= prev.total ? 'ok' : 'bad'}">${s.total - prev.total >= 0 ? '+' : ''}${s.total - prev.total}점</b></p></div>
          <div class="card" style="padding:12px;box-shadow:none"><h3 style="margin-bottom:2px">머리 기울기(안전) 추이 <span class="note">초록 = 표준 0~20°</span></h3>${trendSvg(hist, null, { lo: 0, hi: 50, band: [0, 20], series: [{ n: '머리 기울기°', c: '#d13b3b', f: h => h.metrics.tilt }] })}
            <p style="font-size:12.5px">반복 실수: ${persistent.length ? persistent.map(k => `<b class="bad">${SHORT[k]}</b>`).join(', ') : '<span class="ok">없음</span>'}</p></div>
        </div>
        <div class="tw" style="margin-top:10px"><table class="t"><tr><th>회차</th><th>일자</th><th>종합</th><th>K-PCI</th>${KS.map(k => `<th>${SHORT[k]}</th>`).join('')}</tr>
          ${hist.map(h => `<tr${h === s ? ' style="background:#fff6f5"' : ''}><td><b>${h.attempt}회차</b>${h === s ? ' <span class="tag red">현재</span>' : ''}</td><td class="note">${esc(h.date.slice(0, 10))}</td><td class="num"><b>${h.total}</b></td><td class="num">${h.index}</td>${KS.map(k => { const rt = stdRate(k, h.metrics[k]); return `<td><span class="tag ${RATE_CL[rt]}">${fmtStd(k, h.metrics[k])}</span></td>`; }).join('')}</tr>`).join('')}
          <tr><td colspan="4"><b>직전 대비 변화</b></td>${KS.map(k => { const t = trendOf(k); return `<td>${t ? `<b class="${TR[t][1]}" style="font-size:12px">${TR[t][0]}</b>` : '<span class="note">—</span>'}</td>`; }).join('')}</tr>
        </table></div>`}
      </div>

      <div class="rsec"><h2><span class="no">4</span>AI 종합 해석 <span class="note" style="font-weight:600">밑줄 = 위 표의 근거 · 템플릿 기반 시뮬레이션 · 판정값 불변</span></h2>
        <div class="qbox"><div class="q">Q1 · 표준과 비교하면 어디가 다른가요?</div><p>${issues.length ? `표준 6개 항목 중 <u class="ev">${issues.length}개</u>가 허용범위를 벗어났습니다. ${issues.filter(r => r.safety).length ? `특히 안전 항목 <b>${issues.filter(r => r.safety).map(r => SHORT[r.k]).join(', ')}</b>은(는) 다른 교육생보다 나은지와 관계없이 먼저 교정해야 합니다.` : '안전 항목은 모두 범위 안입니다.'}` : '표준 6개 항목이 모두 허용범위 안입니다.'}</p><div class="chips"><code>std.S1</code><code>imu.tilt_max</code><code>imu.neck_exceed</code></div></div>
        <div class="qbox"><div class="q">Q2 · 같은 조건 교육생 중 나는 어디쯤인가요?</div><p>종합점수는 중앙값(${cm}점) 대비 ${s.total >= cm ? '+' : ''}${s.total - cm}점, <u class="ev">백분위 ${pc}</u>입니다. ${(() => { const p = rows.filter(r => r.pos); if (!p.length) return ''; const b = [...p].sort((a, c) => a.pos.top - c.pos.top)[0], w = [...p].sort((a, c) => c.pos.top - a.pos.top)[0]; return `자세 지표 중 <b>${SHORT[b.k]}</b>는 <u class="ev">${posTxt(b.pos.top)}</u>로 강점이고, <b>${SHORT[w.k]}</b>는 <u class="ev">${posTxt(w.pos.top)}</u>로 같은 조건 교육생 대부분보다 표준에서 멉니다.`; })()}</p><div class="chips"><code>cohort.C-2026-Q3</code><code>cohort.posture_dist</code></div></div>
        <div class="qbox"><div class="q">Q3 · 지난 실습보다 나아졌나요? 반복되는 실수는?</div><p>${hist.length < 2 ? '첫 실습이라 비교할 이전 기록이 없습니다. 이번 결과를 기준선으로 저장했습니다.' : `${s.attempt}회차 실습입니다. 1회차 대비 종합 <u class="ev">${s.total - first.total >= 0 ? '+' : ''}${s.total - first.total}점</u>. 직전 대비 개선: ${improved.length ? improved.map(k => '<b class="ok">' + SHORT[k] + '</b>').join(', ') : '없음'} · 악화: ${worse.length ? worse.map(k => '<b class="bad">' + SHORT[k] + '</b>').join(', ') : '없음'}. ${persistent.length ? `<b>${persistent.map(k => SHORT[k]).join(', ')}</b>은(는) ${hist.length}회 중 반복해서 표준을 벗어난 <u class="ev">반복 실수</u>로, 이번 재교육 1순위로 배정합니다.` : '반복 실수는 없습니다.'}`}</p><div class="chips"><code>history.${esc(s.user)}</code><code>repeat_error.detect</code></div></div>
        <div class="qbox"><div class="q" style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap">우선 보완 순서 · 맞춤 재교육 <span class="tag ${simN >= 20 ? 'teal' : 'amber'}">유사사례 ${simN >= 20 ? '기준 충족' : '축적 중'} · ${Math.min(simN, 20)}/20명</span></div>
          ${prio.length ? prio.slice(0, 3).map((r, i) => `<div class="prio"><b class="n">${i + 1}</b><div><b>${SHORT[r.k]}${persistent.includes(r.k) ? ' — 반복 실수' : ''}${r.safety ? ' (안전)' : ''}</b><p class="muted" style="font-size:12.8px">${prioTxt(r, M)}${r.pos ? ` 코호트 ${posTxt(r.pos.top)}.` : ''}</p></div></div>`).join('') : '<p>보완이 필요한 항목이 없습니다. 다음 실습은 평가모드로 독립 수행을 확인하세요.</p>'}
          <div class="grid g3" style="margin-top:10px">${recs.map((r, i) => `<div class="rec"><span class="k">추천 ${i + 1} · ${r[1]}분 · ${r[3]}</span><div>${r[0]}</div><p>${r[2]}</p></div>`).join('')}</div>
          <p class="note" style="margin-top:6px">${simN >= 20 ? '유사사례(같은 조건 반복 실수자)의 재교육 후 개선 기록을 근거로 추천합니다.' : '유사사례가 기준(20명)에 못 미쳐 승인된 교육과정을 근거로 추천합니다.'}</p>
        </div>
      </div>

      <div class="rsec"><h2><span class="no">5</span>다음 실습 목표 <span class="note" style="font-weight:600">${s.attempt + 1}회차에서 이번 결과와 자동 비교</span></h2>
        <div class="grid g3">${(prio.length ? prio.slice(0, 3) : rows.filter(r => r.v != null).slice(0, 3)).map(r => `<div class="card" style="padding:12px;box-shadow:none"><b>${SHORT[r.k]}</b><p class="muted" style="font-size:12.5px">이번 ${fmtStd(r.k, r.v)} → 목표 ${r.k === 'gyro' ? '기준 이하' : r.k === 'neck' ? '0~1회' : r.lo + '~' + r.hi + r.unit} (표준 S1)</p></div>`).join('')}</div>
      </div>`}
      <div class="prov">근거 정보 · 규칙 R1.0 · 표준 프로파일 S1 · 코호트 C-2026-Q3 (n=240) · 이력 ${esc(s.user)} ${hist.length}회 · 프롬프트 P1.3 · 모델 [상용 LLM API] · 생성 ${esc(s.date)} · AI는 판정값을 바꾸지 않으며 교수자 검토 후 발행 (AI 기본법 투명성 고지)</div>
    </div>`;
    setTimeout(() => { const u = $('#unlockBtn'); if (u) u.onclick = () => { store.tier = 'ai'; renderers.report(); }; });
    return html;
  }
  function prioTxt(r, M) {
    switch (r.k) {
      case 'neck': return `들어올림 ${M.lifts}회 중 ${M.neck}회 머리가 허용각을 넘었습니다. 안전기준이 먼저입니다.`;
      case 'tilt': return `들어 올릴 때 머리 기울기 최대 ${Math.round(M.tilt)}° — 표준(0~20°)을 벗어났습니다. 목 지지와 같은 동작 구간이므로 함께 연습합니다.`;
      case 'burp': return `첫 두드림까지 ${r1(M.burp)}초 — 표준 10~25초와 차이가 있습니다. 순서를 먼저 확인합니다.`;
      case 'react': return `울음 후 첫 행동까지 ${r1(M.react)}초 — 표준 2~5초보다 느립니다.`;
      case 'gyro': return `달래기 중 각속도가 기준을 ${M.gyro}회 넘었습니다(흔들린아이증후군 위험).`;
      case 'roll': return `눕힌 자세 롤 ${Math.round(M.roll)}° — 바로 누움(±15°)을 벗어났습니다.`;
    }
    return '';
  }
  function histSvg(data, me, other) {
    const W = 560, H = 170, pad = 28, bins = 12, lo = 40, hi = 100, bw = (hi - lo) / bins;
    const cnt = Array(bins).fill(0); data.forEach(v => cnt[Math.min(bins - 1, Math.floor((v - lo) / bw))]++);
    const cnt2 = other ? Array(bins).fill(0) : null; if (other) other.forEach(v => cnt2[Math.min(bins - 1, Math.max(0, Math.floor((v - lo) / bw)))]++);
    const mx = Math.max(...cnt.map(c => c / data.length), ...(cnt2 ? cnt2.map(c => c / other.length) : [0]));
    const x = v => pad + (v - lo) / (hi - lo) * (W - pad * 2), y = f => H - 24 - f / mx * (H - 50);
    const bwPx = (W - pad * 2) / bins;
    let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" font-family="Pretendard,sans-serif">`;
    cnt.forEach((c, i) => { const f = c / data.length; s += `<rect x="${pad + i * bwPx + 2}" y="${y(f)}" width="${bwPx - 4}" height="${H - 24 - y(f)}" rx="3" fill="${cnt2 ? '#c9d3e3' : '#bfe7de'}"/>`; });
    if (cnt2) cnt2.forEach((c, i) => { const f = c / other.length; s += `<rect x="${pad + i * bwPx + bwPx * .3}" y="${y(f)}" width="${bwPx * .4}" height="${H - 24 - y(f)}" rx="2" fill="#13a089"/>`; });
    s += `<line x1="${pad}" y1="${H - 24}" x2="${W - pad}" y2="${H - 24}" stroke="#e3e7ef"/>`;
    [40, 55, 70, 85, 100].forEach(v => { s += `<text x="${x(v)}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#9aa3b3">${v}${v === 100 || v === 40 ? '점' : ''}</text>`; });
    const m = med(data); s += `<line x1="${x(m)}" y1="16" x2="${x(m)}" y2="${H - 24}" stroke="#6a7487" stroke-dasharray="3 3"/><text x="${x(m)}" y="12" text-anchor="middle" font-size="10.5" fill="#6a7487">중앙값 ${m}</text>`;
    if (me != null) s += `<line x1="${x(me)}" y1="22" x2="${x(me)}" y2="${H - 24}" stroke="#d13b3b" stroke-width="2.5"/><circle cx="${x(me)}" cy="24" r="5" fill="#d13b3b"/><text x="${x(me) + 8}" y="30" font-size="11.5" font-weight="800" fill="#d13b3b">나 ${me}점</text>`;
    return s + '</svg>';
  }
  function radarSvg(six) {
    const keys = Object.keys(six), N = keys.length, cx = 130, cy = 112, R = 78;
    const pt = (i, f) => { const a = -Math.PI / 2 + i * 2 * Math.PI / N; return [cx + Math.cos(a) * R * f, cy + Math.sin(a) * R * f]; };
    let s = `<svg viewBox="0 0 260 230" style="width:100%;max-width:300px;display:block;margin:0 auto" font-family="Pretendard,sans-serif">`;
    [.25, .5, .75, 1].forEach(f => { s += `<polygon points="${keys.map((_, i) => pt(i, f).join(',')).join(' ')}" fill="none" stroke="#e3e7ef"/>`; });
    keys.forEach((k, i) => { const [x, y] = pt(i, 1); const [lx, ly] = pt(i, 1.22); s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#eef1f6"/><text x="${lx}" y="${ly + 4}" text-anchor="middle" font-size="10.5" fill="#3a4456" font-weight="700">${k}</text><text x="${lx}" y="${ly + 16}" text-anchor="middle" font-size="10" fill="#0d7a69">${six[k] == null ? '—' : Math.round(six[k])}</text>`; });
    s += `<polygon points="${keys.map((k, i) => pt(i, (six[k] == null ? 0 : six[k]) / 100).join(',')).join(' ')}" fill="rgba(19,160,137,.22)" stroke="#13a089" stroke-width="2"/>`;
    return s + '</svg>';
  }

  // =====================================================================
  //  3. 표준 육아돌봄 모델 (플랫폼)
  // =====================================================================
  renderers.model = function () {
    const L = store.lake, last = store.current || store.base;
    const sample = {
      session_id: 'hash:' + (last.id.charCodeAt(2) * 7919).toString(16) + '…', subject: 'pseudonym:' + last.user.replace(/\d/g, '*'), consent: { research: true, cohort: true, region_code: '44180' },
      device: { robot: 'SB-06', fw: '2.0.3', tablet_app: 'BCC 2.0.3' }, rule_version: 'R1.0', std_profile: 'S1', cohort: 'C-2026-Q3',
      mode: last.mode, level: last.level,
      events: last.evs.slice(0, 2).map(e => ({ event: e.id, t1_sec: e.t1, score1: e.g1 + ':' + e.s1, score2: e.g2 + ':' + e.s2, react_sec: e.react, hints: e.hints })),
      imu_summary: { head_tilt_max_deg: last.metrics.tilt == null ? null : Math.round(last.metrics.tilt), neck_exceed: last.metrics.neck, gyro_over: last.metrics.gyro },
      indicators: { k_pci: last.index, care: last.domain.care && Math.round(last.domain.care), safety: last.domain.safe && Math.round(last.domain.safe), emergency: last.domain.emer && Math.round(last.domain.emer) },
    };
    $('#v-model').innerHTML = head('③ 플랫폼', '한국형 표준 육아돌봄 모델', '센서 13종 · 이벤트 18종의 판정 기준과 전문가 표준 프로파일을 버전 관리하고, 세션 데이터를 코호트·지표로 축적합니다.') + `
    <div class="card">
      <div class="ch"><h2>데이터 파이프라인 <span class="note" style="font-weight:600">실습할 때마다 아래 숫자가 올라갑니다</span></h2><button class="btn sm" data-go="sim">시뮬레이터에서 세션 추가 →</button></div>
      <div class="pipe">
        <div class="pn"><span class="k">COLLECT</span><div>센서 원천</div><p>13종 · BT 상태값 · 태블릿 Rule Engine 판정</p><div class="c num">${(L.records / 1e6).toFixed(2)}M</div><p>레코드</p></div><div class="ar">→</div>
        <div class="pn"><span class="k">CONSENT</span><div>동의 · 비식별</div><p>가명 ID · 지역코드 · 연구/코호트 동의 분리</p><div class="c num">${L.consent}%</div><p>분석 동의율</p></div><div class="ar">→</div>
        <div class="pn"><span class="k">LAKE</span><div>데이터레이크</div><p>세션 · 이벤트 · IMU 요약 · 대화 로그</p><div class="c num">${fmtN(L.sessions)}</div><p>세션 / 이벤트 ${fmtN(L.events)}</p></div><div class="ar">→</div>
        <div class="pn"><span class="k">ENGINE</span><div>지표 엔진</div><p>코호트 · 백분위 · K-PCI · 지역코드 결합</p><div class="c num">${L.inst}</div><p>참여 기관</p></div><div class="ar">→</div>
        <div class="pn" style="background:var(--navy);color:#fff;border-color:var(--navy)"><span class="k" style="color:#8fe9d6">MODEL</span><div>표준 모델 갱신</div><p style="color:#cfe0f2">전문가 검토 후 R1.0 → R1.1 · S1 → S2</p><div class="c num" style="color:#8fe9d6">R1.0</div><p style="color:#cfe0f2">현재 규칙 버전</p></div>
      </div>
    </div>
    <div class="grid g2 mt">
      <div class="card">
        <h2>양육역량지수 (K-PCI) 정의</h2>
        <div class="formula">K-PCI = <b>0.40</b> × 일상돌봄 + <b>0.35</b> × 안전예방 + <b>0.25</b> × 영아응급</div>
        <div class="tw" style="margin-top:10px"><table class="t">
          <tr><th>영역</th><th>산출</th><th>원천</th></tr>
          <tr><td><b>일상돌봄</b> (7종)</td><td>이벤트 점수 평균 = 1차(A50~F0, 완수시간) + 2차(ㄱ50·ㄴ25·ㄷ0)</td><td>Rule Engine</td></tr>
          <tr><td><b>안전예방</b> (8종)</td><td>안전점수(5~1) × 20 − 위험행동 × 4</td><td>IMU · 자세 · 환경센서</td></tr>
          <tr><td><b>영아응급</b> (3종)</td><td>심정지·기도폐쇄·발열 이벤트 점수 평균</td><td>가슴·등·귀 센서</td></tr>
        </table></div>
        <p class="note" style="margin-top:8px">미체험 영역은 가중치에서 제외하고 재정규화 · 코호트 비교는 n ≥ 30일 때만 표시 · 유사사례 추천은 n ≥ 20일 때만 사용</p>
      </div>
      <div class="card">
        <div class="ch"><h2>세션 레코드 스키마 (비식별 후)</h2><span class="tag">${esc(last.id)}</span></div>
        <pre class="code">${esc(JSON.stringify(sample, null, 2))}</pre>
      </div>
    </div>
    <div class="card mt">
      <div class="ch"><h2>이벤트 18종 · 평가기준 (규칙 R1.0)</h2><span class="note">출처: 썬베이비 케어 개념 정리 (이벤트·사운드·점수표)</span></div>
      <div class="tw"><table class="t">
        <tr><th>분류</th><th>이벤트</th><th>이벤트 신호</th><th>1차 조건</th><th>2차 완료 조건 / 대응</th><th>제한</th><th>성공 / 실패 사운드</th></tr>
        ${EVENTS.map(e => `<tr><td><span class="tag ${e.cat === 'emer' ? 'red' : e.cat === 'safety' ? 'amber' : 'teal'}">${CAT[e.cat]}</span></td><td><b>${e.ico} ${e.name}</b></td><td>${e.signal} <code style="font-size:11px;color:var(--muted)">${e.snd}</code></td>
          <td>${e.c1 ? e.c1.label : '<span class="muted">트리거: ' + e.trig + '</span>'}</td><td>${e.c2 ? e.c2.label : e.fixLabel + ' <span class="muted">(≤5초 5점 · ≤15 4 · ≤30 3 · ≤60 2 · 미처리 1)</span>'}</td><td class="num">${e.limit ? fmtT(e.limit) : '1:00'}</td><td class="muted">${e.ok ? e.ok + ' / ' + e.ng : '—'}</td></tr>`).join('')}
      </table></div>
      <div class="grid g3 mt">
        <div><h3>1차 조건 점수표</h3><div class="tw"><table class="t"><tr><th>구분</th><th>점수</th><th>완수 시간</th></tr>${SCORE1.map((r, i) => `<tr><td><b>${r.g}</b></td><td>${r.s}</td><td>${i === 0 ? '~15초' : r.max === Infinity ? '121초~' : (SCORE1[i - 1].max + 1) + '~' + r.max + '초'}</td></tr>`).join('')}</table></div></div>
        <div><h3>2차 조건 점수표</h3><div class="tw"><table class="t"><tr><th>구분</th><th>점수</th><th>결과</th></tr>${Object.values(SCORE2).map(r => `<tr><td><b>${r.g}</b></td><td>${r.s}</td><td>${r.t}</td></tr>`).join('')}</table></div>
          <h3 style="margin-top:12px">센서 13종</h3><div style="display:flex;flex-wrap:wrap;gap:4px">${SENSORS.map(s => `<span class="tag">${s.id} ${s.name}</span>`).join('')}</div></div>
        <div><h3>표준 프로파일 S1</h3><div class="tw"><table class="t"><tr><th>항목</th><th>표준</th><th>허용</th></tr>${STD.map(r => `<tr><td>${r.task}</td><td>${r.std}</td><td>${r.k === 'gyro' ? '기준 이하' : r.lo + '~' + r.hi + r.unit}</td></tr>`).join('')}</table></div><p class="note" style="margin-top:6px">전문가 5인 × 5회 수행 · IMU 측정</p></div>
      </div>
    </div>
    <div class="card mt">
      <h2>표준 모델 거버넌스 · 버전 레지스트리</h2>
      <div class="tw"><table class="t">
        <tr><th>자산</th><th>현재</th><th>다음 후보</th><th>변경 근거</th><th>승인</th></tr>
        <tr><td>판정 규칙</td><td><b>R1.0</b></td><td>R1.1</td><td>트림 2차 조건 20회 → 수유량 연동 (현장 피드백 14건)</td><td><span class="tag amber">표준위원회 검토 중</span></td></tr>
        <tr><td>표준 프로파일</td><td><b>S1</b> (5인×5회)</td><td>S2 (12인×5회)</td><td>간호·보육 전문가 확대, 기관별 편차 보정</td><td><span class="tag">계획 2027 H1</span></td></tr>
        <tr><td>코호트</td><td><b>C-2026-Q3</b> n=240</td><td>C-2026-Q4</td><td>분기 단위 재산출 · n ≥ 30 미만 집단 비교 보류</td><td><span class="tag teal">자동</span></td></tr>
        <tr><td>AI 프롬프트</td><td><b>P1.2</b></td><td>P1.3</td><td>Q2 우선순위: 안전기준 우선 규칙 명시</td><td><span class="tag amber">교수자 평가 중</span></td></tr>
        <tr><td>교육 콘텐츠 KB</td><td><b>KB 1.0</b> (${KB.length}개 주제)</td><td>KB 1.1</td><td>질병관리청 예방접종 일정 갱신 반영</td><td><span class="tag">검수 대기</span></td></tr>
      </table></div>
      <p class="note" style="margin-top:8px">원칙: 어떤 AI 개선도 센서 판정을 바꾸지 못한다 — 판정 규칙 변경은 표준위원회 승인 · 버전 표기 후 배포, 과거 세션은 당시 버전으로 재현 가능.</p>
    </div>`;
  };

  // =====================================================================
  //  4. 기관 백오피스
  // =====================================================================
  function sessToTrainee(s, i) {
    const M = s.metrics, map = { ok: 'ok', warn: 'warn', out: 'out', na: 'ok' };
    return { id: s.user, cls: '데모', s: s.total, sess: 1, r: ['react', 'tilt', 'neck', 'burp', 'gyro', 'roll'].map(k => map[stdRate(k, M[k])]), st: store.reviewed[s.id] ? '발행됨' : (s.offline ? '전송 대기' : '검토 필요'), re: s.total < 75 ? '배정됨' : '없음', sid: s.id, live: true };
  }
  renderers.office = function () {
    const extra = store.sessions.map(sessToTrainee);
    const list = [...extra, ...TRAINEES];
    const instScores = (() => { const R = mulberry(3); const a = []; for (let i = 0; i < 86; i++) a.push(clamp(Math.round(75 + gauss(R) * 10), 40, 100)); return a.concat(store.sessions.map(s => s.total)); })();
    const nSess = 86 + store.sessions.length;
    const review = list.filter(t => t.st === '검토 필요' || t.st === '전송 대기');
    const cols = ['울음 반응시간', '머리 기울기', '목 지지', '트림 첫 행동', '달래기 각속도', '수면 자세'];
    const rateCnt = cols.map((_, j) => Math.round(list.filter(t => t.r[j] === 'out').length / list.length * 100));
    const cell = r => `<td><span class="tag ${r === 'ok' ? 'pill-ok' : r === 'warn' ? 'pill-warn' : 'pill-bad'}">${r === 'ok' ? '범위' : r === 'warn' ? '주의' : '이탈'}</span></td>`;
    $('#v-office').innerHTML = head('④ SW · 백오피스', '기관 관리자 — 훈련 현황', '[예시 기관] 간호학과 2학년 · 2026년 11월 · 과정: 기본과정 · 최근 30일', '<button class="btn" id="offExport">⤓ 데이터 Export (AI PRO)</button>') + `
    <div class="grid g4">
      <div class="card kpi"><div class="l">실습 세션</div><div class="v num">${nSess}</div><div class="d">실습자 ${64 + store.sessions.length}명</div></div>
      <div class="card kpi"><div class="l">AI Report 발행</div><div class="v num">${71 + Object.keys(store.reviewed).length}</div><div class="d">전송 대기 6건 포함 안 함</div></div>
      <div class="card kpi"><div class="l">검토 대기</div><div class="v num" style="color:var(--amber)">${review.length}</div><div class="d">교수자 검토 후 발행 (AI 단독 발행 없음)</div></div>
      <div class="card kpi"><div class="l">안전기준 미충족 세션</div><div class="v num" style="color:var(--bad)">31%</div><div class="d">27 / 86 · 전체 코호트 24%</div></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="ch"><h2>종합점수 분포 · 우리 기관 vs 전체 코호트</h2><span class="note">비율로 비교</span></div>${histSvg(COHORT, null, instScores)}
        <div style="display:flex;gap:12px;font-size:11.5px" class="muted"><span>■ <span style="color:#13a089">우리 기관</span> 중앙값 ${med(instScores)}점</span><span>■ <span style="color:#9aa8bf">전체 코호트</span> 중앙값 ${med(COHORT)}점 (같은 조건)</span></div></div>
      <div class="card"><h2>표준 이탈이 많은 항목 TOP 3</h2>
        ${[['목 지지 · 허용각 초과', 26, 22, 19], ['안아 올리기 · 머리 기울기', 21, 18, 15], ['트림 · 첫 두드림까지 시간', 18, 15, 17]].map(([n, p, c, all]) => `<div style="margin:10px 0"><div style="display:flex;justify-content:space-between;font-size:12.8px"><b>${n}</b><span class="num">${p}% · ${c}/86 · <span class="muted">전체 ${all}%</span></span></div><div class="bar" style="position:relative;margin-top:4px"><i style="width:${p * 2.5}%;background:${p - all >= 5 ? 'var(--bad)' : 'var(--teal)'}"></i><span style="position:absolute;top:-3px;left:${all * 2.5}%;width:2px;height:14px;background:#6a7487"></span></div></div>`).join('')}
        <div class="msg ai" style="max-width:100%;margin-top:8px"><div class="who">AI 요약 · 교수자용</div>안전 항목 두 개(목 지지, 머리 기울기)가 전체 코호트보다 6~7%p 높습니다. 다음 수업에서 <b>안아 올리기–이동 연결 동작</b>을 반 전체 시범으로 다루는 것을 검토하세요.</div>
      </div>
    </div>
    <div class="card mt">
      <div class="ch"><h2>표준자세 대비 분석표 <span class="note" style="font-weight:600">실습자별 최근 세션 · S1 · IMU</span></h2><span class="note">가명 ID · 실명은 권한 확인 후 열람</span></div>
      <div class="tw"><table class="t"><tr><th>실습자</th><th>반</th><th>점수</th>${cols.map(c => `<th>${c}</th>`).join('')}</tr>
        ${list.map(t => `<tr${t.live ? ' style="background:#f1fbf8"' : ''}><td><b>${t.id}</b>${t.live ? ' <span class="tag teal">방금</span>' : ''}</td><td>${t.cls}</td><td class="num">${t.s}</td>${t.r.map(cell).join('')}</tr>`).join('')}
        <tr><td colspan="3"><b>기관 이탈률</b></td>${rateCnt.map(p => `<td class="num"><b>${p}%</b></td>`).join('')}</tr>
      </table></div>
    </div>
    <div class="grid g2 mt">
      <div class="card"><div class="ch"><h2>AI Report 검토 대기</h2><span class="note">AI 초안 → 교수자 확인 → 발행</span></div>
        <div class="tw"><table class="t"><tr><th>실습자</th><th>점수</th><th>우선 보완 1순위</th><th>상태</th><th></th></tr>
        ${list.filter(t => t.st !== '발행됨').map(t => { const pri = t.r.findIndex(x => x === 'out'); return `<tr><td><b>${t.id}</b></td><td class="num">${t.s}</td><td>${pri >= 0 ? cols[pri] + ([1, 2, 4, 5].includes(pri) ? ' (안전)' : '') : '—'}</td><td><span class="tag ${t.st === '전송 대기' ? '' : 'amber'}">${t.st}${t.st === '전송 대기' ? ' (오프라인)' : ''}</span></td><td>${t.st === '전송 대기' ? '<span class="note">1.0 Report만 제공 중</span>' : `<button class="btn sm" data-rv="${t.sid || t.id}">검토하기</button>`}</td></tr>`; }).join('')}
        </table></div></div>
      <div class="card">
        <h2>실습기관 운영 현황 <span class="note" style="font-weight:600">2026학년도 2학기</span></h2>
        <div class="grid g3" style="margin-top:8px">
          ${[['2학년 A반', 32, 44, 77, 28, '검토 대기 4건 · 재교육 7명'], ['2학년 B반', 32, 42, 74, 34, '전체보다 미충족 10%p 높음 · 목 지지 집중'], ['3학년 심화반', 24, 18, 81, 17, '코호트 22명 · 30명 미만이라 분포 비교 보류']].map(([n, p, se, md, un, nt]) => `<div class="card" style="padding:10px;box-shadow:none"><b>${n}</b> <span class="note">${p}명</span><div style="display:flex;justify-content:space-between;font-size:12px;margin-top:6px"><span>세션 <b>${se}</b></span><span>중앙값 <b>${md}</b></span><span>미충족 <b class="${un > 30 ? 'bad' : ''}">${un}%</b></span></div><p class="note" style="margin-top:4px">${nt}</p></div>`).join('')}
        </div>
        <div class="grid g2 mt">
          <div><h3>장비 현황</h3><p style="font-size:12.5px">인형 8대 · 사용 가능 6 · 충전 중 1 · <span class="bad">점검 1</span><br><span class="muted">SB-06 · IMU 영점 보정 필요 (자세 오차 큼)</span></p><p style="font-size:12.5px;margin-top:6px">태블릿 8대 · 앱 v2.0.3 최신 7 · <span class="warn">업데이트 1</span><br><span class="muted">TAB-03 · 전송 대기 6세션 (오프라인 3일)</span></p></div>
          <div><h3>AI 이용권</h3><div style="font-size:12.5px">${214 + store.sessions.length * 9} / 1,000건 사용</div><div class="bar" style="margin:6px 0"><i style="width:${(214 + store.sessions.length * 9) / 10}%"></i></div><p class="note">AI 호출 = 질문·힌트·Report 생성 · 필요한 순간에만 호출 · 사용량 관리</p>
            <h3 style="margin-top:8px">이번 주 실습 일정</h3><p style="font-size:12px" class="muted">11/24 2-A 기본과정 3시간 · 11/25 2-B 목 지지 재교육(12명) · 11/26 심화반 평가모드 · 11/27 2-B 재평가</p></div>
        </div>
      </div>
    </div>`;
    $('#offExport').addEventListener('click', () => {
      const rows = [['trainee', 'class', 'score', ...cols]].concat(list.map(t => [t.id, t.cls, t.s, ...t.r]));
      const csv = '﻿' + rows.map(r => r.join(',')).join('\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'sunbaby_institution_export.csv'; a.click();
      toast('기관 통계 Export (가명 ID · CSV)');
    });
    $$('[data-rv]', $('#v-office')).forEach(b => b.addEventListener('click', () => {
      const id = b.dataset.rv; const s = store.sessions.find(x => x.id === id);
      if (s) { store.reviewed[s.id] = true; store.current = s; toast(`${s.user} AI Report 검토 → 발행`); go('report'); }
      else { b.closest('tr').querySelector('.tag').textContent = '발행됨'; b.replaceWith(Object.assign(document.createElement('span'), { className: 'note', textContent: '교수자 확인 완료' })); toast(`${id} 리포트 발행 (예시)`); }
    }));
  };

  // =====================================================================
  //  5. 공공데이터 · 지역 대시보드 (CareGraph)
  // =====================================================================
  const RG = { sel: '충남', drill: false, edu: 20 };
  function regionData() {
    const R = mulberry(11);
    return REGIONS.map(r => {
      const care = clamp(r.idx + 2 + gauss(R) * 2, 50, 98), safety = clamp(r.idx - 1 + gauss(R) * 3, 50, 98), emer = clamp(r.idx - 4 + gauss(R) * 3, 45, 98);
      const acc = +(8.9 - (r.idx - 66) * 0.21 + gauss(R) * 0.35).toFixed(2);
      return { ...r, care, safety, emer, acc };
    });
  }
  function corr(xs, ys) { const mx = avg(xs), my = avg(ys); let a = 0, b = 0, c = 0; xs.forEach((x, i) => { a += (x - mx) * (ys[i] - my); b += (x - mx) ** 2; c += (ys[i] - my) ** 2; }); return a / Math.sqrt(b * c); }
  const tileColor = v => { const f = clamp((v - 58) / 32, 0, 1); const c1 = [31, 58, 90], c2 = [55, 209, 179]; return `rgb(${c1.map((c, i) => Math.round(c + (c2[i] - c) * f)).join(',')})`; };
  renderers.region = function () {
    const D = regionData(); const r = D.find(x => x.name === RG.sel);
    const nat = { births: D.reduce((a, x) => a + x.births, 0) * 1.0, idx: avg(D.map(x => x.idx)), edu: D.reduce((a, x) => a + x.edu, 0) * 10, budget: D.reduce((a, x) => a + x.budget, 0) };
    const rc = corr(D.map(x => x.idx), D.map(x => x.acc));
    const recs = CURRICULUM.filter(c => c.rule(r));
    // 정책 시뮬레이션 (예시 회귀 모형)
    const slope = -0.21, dIdx = RG.edu * 0.09, newIdx = Math.min(98, r.idx + dIdx), newAcc = Math.max(0, r.acc + slope * dIdx);
    const accCut = (r.acc - newAcc) / r.acc;
    const avoided = Math.round(r.births * 12 * (r.acc - newAcc) / 1000 * 1450); // 만원 단위 · 사고 1건당 사회적 비용 1,450만원 가정
    const cost = Math.round(r.edu * 10 * RG.edu / 100 * 28); // 만원 · 1회 교육 28만원 가정
    $('#v-region').innerHTML = head('⑤ SW · 공공데이터 결합', 'CareGraph — 돌봄 빅데이터 대시보드', '썬베이비 역량 데이터 × 공공데이터(출생·접종·검진·거점·예산)를 지역코드로 결합한 지자체·중앙부처용 계층별 대시보드',
      `<div class="seg" id="rgMode"><button class="${RG.drill ? '' : 'on'}" data-d="0">전국 → 시·도</button><button class="${RG.drill ? 'on' : ''}" data-d="1">충남 → 보령시</button></div>`) + `
    <div class="cg">
      <div class="ch"><div><span class="tag teal">MAIN</span> <b style="font-size:16px;color:#fff;margin-left:4px">전국 대시보드</b> <span class="muted" style="font-size:12px">· 17개 시·도 집계 · 2026.10.14 기준 · 시연용 예시 데이터</span></div><span class="muted" style="font-size:12px">드릴다운: 전국 › <b style="color:#7fe3cf">${RG.drill ? '충청남도 › 보령시' : RG.sel}</b></span></div>
      <div class="grid g4">
        <div class="card kpi"><div class="l">월 출생아 (KOSIS)</div><div class="v num">${fmtN(nat.births)}</div><div class="d muted">합계출산율 ${(avg(D.map(x => x.tfr))).toFixed(2)} (시도 평균)</div></div>
        <div class="card kpi"><div class="l">전국 양육역량지수</div><div class="v num">${nat.idx.toFixed(1)}<small>점</small></div><div class="d muted">전월 +1.4 · 세션 ${fmtN(store.lake.sessions)}</div></div>
        <div class="card kpi"><div class="l">가정 내 사고 (역량 상위 vs 하위)</div><div class="v num" style="color:#f5a524">▼${Math.round((1 - avg(D.filter(x => x.idx >= 80).map(x => x.acc)) / avg(D.filter(x => x.idx < 75).map(x => x.acc))) * 100)}%</div><div class="d muted">상관계수 r = ${rc.toFixed(2)}</div></div>
        <div class="card kpi"><div class="l">구독 기관 · 연 구독액</div><div class="v num">418<small>개소</small></div><div class="d muted">61억 원 · 가동 장비 1,240대</div></div>
      </div>
      ${RG.drill ? boryeongHtml() : `
      <div class="grid g2 mt">
        <div class="card">
          <h3>시·도별 양육역량지수 <span class="muted" style="font-weight:600;font-size:11.5px">· 타일을 눌러 선택</span></h3>
          <div class="tiles" id="tiles">${D.map(x => `<div class="tile${x.name === RG.sel ? ' sel' : ''}" data-r="${x.name}" style="background:${tileColor(x.idx)};color:${x.idx > 74 ? '#05261f' : '#dbe6f7'}">${x.ctrs >= 8 ? '<span class="mk">🏥</span>' : ''}<b>${x.idx}</b><span>${x.name}</span></div>`).join('')}</div>
          <div class="scale"></div><div style="display:flex;justify-content:space-between" class="note"><span>낮음</span><span>🏥 거점 보건소 8곳 이상</span><span>높음</span></div>
        </div>
        <div class="card">
          <div class="ch"><h3>${r.name} · 공공데이터 + 썬베이비 = 결합지표</h3>${r.name === '충남' ? '<button class="btn sm pri" id="drillBtn">보령시 드릴다운 →</button>' : ''}</div>
          <div class="grid g3" style="gap:8px">
            ${[['합계출산율', r.tfr.toFixed(2), 'KOSIS'], ['월 출생아', fmtN(r.births) + '명', 'KOSIS'], ['접종 적기율', r.vacc + '%', '질병청'], ['검진 수검률', r.check + '%', '건보공단'], ['거점 보건소', r.ctrs + '곳', '공공데이터포털'], ['출산지원 예산', fmtN(r.budget) + '억', '지자체']].map(([l, v, s]) => `<div style="background:#0f1d38;border:1px solid #22375f;border-radius:10px;padding:8px"><div class="muted" style="font-size:11px">${l}</div><b class="num" style="font-size:17px;color:#fff">${v}</b><div class="note" style="font-size:10px">${s}</div></div>`).join('')}
          </div>
          <div class="grid g4" style="gap:8px;margin-top:8px">
            ${[['양육역량지수', r.idx], ['돌봄', Math.round(r.care)], ['안전', Math.round(r.safety)], ['응급', Math.round(r.emer)]].map(([l, v]) => `<div style="background:#13284d;border-radius:10px;padding:8px;text-align:center"><div class="muted" style="font-size:11px">${l}</div><b class="num" style="font-size:20px;color:#7fe3cf">${v}</b></div>`).join('')}
          </div>
          <p class="note" style="margin-top:8px">가정 내 사고율 ${r.acc}‰ · 연 교육 ${r.edu * 10}회 · 썬베이비 역량 = 동의·비식별 집계</p>
        </div>
      </div>`}
      <div class="grid g2 mt">
        <div class="card"><h3>양육역량이 오르면 사고가 준다 <span class="muted" style="font-size:11.5px;font-weight:600">· 시·도별 · r = ${rc.toFixed(2)}</span></h3>${scatterSvg(D)}</div>
        <div class="card">
          <h3>공공데이터 연계 교육과정 자동 추천 · ${RG.drill ? '보령시' : r.name}</h3>
          <p class="muted" style="font-size:12px;margin-bottom:8px">지역 공공지표의 공백 + 썬베이비 역량 약점 → 승인된 교육과정 모듈 조합 (규칙 기반 · 교육청/보건소 검토 후 편성)</p>
          <div class="grid" style="gap:6px">${recs.map(c => `<div class="currow"><span class="id">${c.id}</span><div style="flex:1"><b style="color:#fff">${c.name}</b> <span class="muted" style="font-size:11.5px">· ${c.hrs}시간 · ${c.who}</span><div class="note" style="font-size:11px">근거: ${c.why} · 채널: ${c.ch}</div></div></div>`).join('')}</div>
        </div>
      </div>
      <div class="grid g2 mt">
        <div class="card">
          <h3>정책 시뮬레이션 · ${r.name} <span class="muted" style="font-size:11.5px;font-weight:600">· 예시 회귀 모형 (검증 전)</span></h3>
          <label class="muted" style="font-size:12px">교육 인원 확대 <b style="color:#7fe3cf" id="eduV">+${RG.edu}%</b></label>
          <input type="range" min="0" max="100" step="5" value="${RG.edu}" id="eduR">
          <div class="grid g4" style="gap:8px;margin-top:8px">
            ${[['양육역량지수', `${r.idx} → ${newIdx.toFixed(1)}`], ['가정 내 사고율', `${r.acc} → ${newAcc.toFixed(2)}‰`], ['사회적 비용 회피', `${fmtN(avoided)}만 원`], ['투입 대비 효과', `${cost ? (avoided / cost).toFixed(1) : '—'}배`]].map(([l, v]) => `<div style="background:#0f1d38;border:1px solid #22375f;border-radius:10px;padding:8px"><div class="muted" style="font-size:11px">${l}</div><b class="num" style="color:#fff;font-size:14px">${v}</b></div>`).join('')}
          </div>
          <p class="note" style="margin-top:6px">가정: 교육 확대 10%p당 지수 +0.9 · 사고 1건당 사회적 비용 1,450만 원 · 교육 1회 28만 원 — 실제 효과는 시범사업 데이터로 재추정</p>
        </div>
        <div class="card"><h3>연계 공공데이터 API</h3>
          <div class="tw"><table class="t"><tr><th>데이터</th><th>제공</th><th>갱신</th><th>활용</th></tr>${PUBLIC_APIS.map(a => `<tr><td><b>${a.name}</b></td><td>${a.org}</td><td>${a.cycle}</td><td>${a.use}</td></tr>`).join('')}</table></div>
          <p class="note" style="margin-top:6px">지역코드(시·군·구) 기준 결합 · 썬베이비 데이터는 개인 단위로 공공데이터와 결합하지 않음(집계 단위만)</p>
        </div>
      </div>
      <div class="card mt"><h3>계층별 제공 (B2G SaaS)</h3>
        <div class="grid g3" style="gap:8px">
          ${[['현장', '보건소', '관할 역량·안전 현황, 교육 성과 리포트 → 감사·실적 근거'], ['정책', '지자체 (시·군·구/도)', '지역 비교 · 정책 시뮬레이션 · 예산 대비 효과'], ['전국', '중앙부처 (복지부·저고위)', '전국 집계 · 표준지표 · 정책 모니터링']].map(([k, n, d]) => `<div class="currow"><span class="id" style="width:auto">${k}</span><div><b style="color:#fff">${n}</b><div class="note" style="font-size:11.5px">${d}</div></div></div>`).join('')}
        </div>
        <p class="note" style="margin-top:8px">과금: 초기 구축비(공공데이터 연계·지표 설계·대시보드) + 연 구독료(자동 갱신·운영·보안·지표 고도화) · 조달: 디지털서비스 전문계약 또는 정보화 용역</p>
      </div>
    </div>`;
    $$('#tiles .tile').forEach(t => t.addEventListener('click', () => { RG.sel = t.dataset.r; renderers.region(); }));
    $$('#rgMode button').forEach(b => b.addEventListener('click', () => { RG.drill = b.dataset.d === '1'; if (RG.drill) RG.sel = '충남'; renderers.region(); }));
    const db = $('#drillBtn'); if (db) db.addEventListener('click', () => { RG.drill = true; renderers.region(); });
    const er = $('#eduR'); if (er) { er.addEventListener('input', e => { $('#eduV').textContent = '+' + e.target.value + '%'; }); er.addEventListener('change', e => { RG.edu = +e.target.value; renderers.region(); }); }
  };
  function boryeongHtml() {
    return `<div class="grid g2 mt">
      <div class="card"><h3><span class="tag teal">SUB · 보령시</span> 읍·면·동 양육역량 지도</h3>
        <div class="tiles" style="grid-template-columns:repeat(5,1fr)">${BORYEONG.map(x => `<div class="tile" style="background:${tileColor(x.idx)};color:${x.idx > 74 ? '#05261f' : '#dbe6f7'}">${x.mark ? `<span class="mk">${{ hc: '🏥', pc: '▲', sc: '●', gap: '○' }[x.mark]}</span>` : ''}<b>${x.idx}</b><span>${x.name}</span></div>`).join('')}</div>
        <div class="scale"></div><p class="note" style="margin-top:6px">🏥 보건소 · ▲ 산후조리원 · ● 학교 · ○ 미도입(공백) — 미산면·천북면은 거점 공백 → 방문형 교육 우선</p></div>
      <div class="card"><h3>보령시 대시보드 · 충청남도 보령시</h3>
        <div class="grid g3" style="gap:8px">
          ${[['총 인구', '97,800명'], ['0세 가정', '360가정'], ['월 출생아', '31명'], ['합계출산율', '0.92'], ['양육역량지수', '80.8 (+2.6)'], ['가정 내 사고', '▼16%'], ['진행 기수 / 누적 교육', '6기 / 214명'], ['CPR 정확도', '90.4'], ['비용 회피액', '3,100만 원'], ['길목 (보건소·조리원·학교)', '1 · 2 · 28'], ['구독 기관 · 연 구독액', '5개소 · 6,800만 원'], ['0~6개월 구매 전환', '58가정 · 26.4%']].map(([l, v]) => `<div style="background:#0f1d38;border:1px solid #22375f;border-radius:10px;padding:8px"><div class="muted" style="font-size:11px">${l}</div><b class="num" style="color:#fff">${v}</b></div>`).join('')}
        </div></div>
    </div>`;
  }
  function scatterSvg(D) {
    const W = 520, H = 220, p = 34, x = v => p + (v - 64) / (92 - 64) * (W - p * 2), y = v => H - p - (v - 2) / (9 - 2) * (H - p * 2);
    let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" font-family="Pretendard,sans-serif">`;
    [2, 5, 8].forEach(v => { s += `<line x1="${p}" x2="${W - p}" y1="${y(v)}" y2="${y(v)}" stroke="#1d3159"/><text x="${p - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#8ea3c7">${v}‰</text>`; });
    [65, 75, 85].forEach(v => { s += `<text x="${x(v)}" y="${H - 12}" text-anchor="middle" font-size="10" fill="#8ea3c7">${v}</text>`; });
    const xs = D.map(d => d.idx), ys = D.map(d => d.acc), mx = avg(xs), my = avg(ys);
    const b = xs.reduce((a, xv, i) => a + (xv - mx) * (ys[i] - my), 0) / xs.reduce((a, xv) => a + (xv - mx) ** 2, 0), a0 = my - b * mx;
    s += `<line x1="${x(64)}" y1="${y(a0 + b * 64)}" x2="${x(92)}" y2="${y(a0 + b * 92)}" stroke="#f5c45a" stroke-width="2" stroke-dasharray="6 5"/>`;
    D.forEach(d => { s += `<circle cx="${x(d.idx)}" cy="${y(d.acc)}" r="${d.name === RG.sel ? 7 : 5}" fill="${d.name === RG.sel ? '#f5a524' : '#37d1b3'}"/>${d.name === RG.sel ? `<text x="${x(d.idx) + 9}" y="${y(d.acc) - 6}" font-size="11" fill="#f5c45a" font-weight="800">${d.name}</text>` : ''}`; });
    s += `<text x="${W - p}" y="${H - 24}" text-anchor="end" font-size="10.5" fill="#7fe3cf">양육역량지수 →</text><text x="${p}" y="14" font-size="10.5" fill="#7fe3cf">가정 내 사고율(‰)</text>`;
    return s + '</svg>';
  }

  // =====================================================================
  //  6. 개인화 — 베이비내비 (B2C)
  // =====================================================================
  const PS = { days: 21, region: '충남' };
  const SCHEDULE = [
    [0, 0, '💉', 'B형간염 1차', '출생 직후'], [0, 28, '💉', 'BCG(결핵)', '생후 4주 이내'], [14, 35, '🩺', '영유아 건강검진 1차', '생후 14~35일'],
    [28, 35, '💉', 'B형간염 2차', '생후 1개월'], [56, 63, '💉', 'DTaP·IPV·Hib·폐렴구균·로타 1차', '생후 2개월'], [112, 119, '💉', 'DTaP·IPV·Hib·폐렴구균·로타 2차', '생후 4개월'],
    [120, 180, '🩺', '영유아 건강검진 2차', '생후 4~6개월'], [180, 187, '💉', 'DTaP·IPV·B형간염·Hib·폐렴구균 3차', '생후 6개월'], [270, 365, '🩺', '영유아 건강검진 3차', '생후 9~12개월'],
  ];
  renderers.personal = function () {
    const s = store.current || store.base; const D = regionData(); const r = D.find(x => x.name === PS.region);
    const M = s.metrics;
    const weak = STD.filter(x => ['out', 'warn'].includes(stdRate(x.k, M[x.k])));
    const upcoming = SCHEDULE.filter(x => x[1] >= PS.days).slice(0, 4);
    const age = PS.days < 0 ? `출산 ${-PS.days}일 전` : `생후 ${PS.days}일`;
    const recs = CURRICULUM.filter(c => c.rule(r) && c.id !== 'M7').slice(0, 2);
    $('#v-personal').innerHTML = head('⑥ SW · 개인화 (B2C)', '베이비내비 — 우리 아기 맞춤 케어 리포트', '교육 이력(썬베이비) + 접종·검진 일정(공공) + 지역 출산지원 = 맞춤 케어 알림. 개인 구독 서비스의 시연 화면입니다.') + `
    <div class="grid" style="grid-template-columns:minmax(0,360px) 1fr;gap:20px;align-items:start">
      <div class="phone"><div class="pscreen">
        <div class="phd"><small>베이비내비 · ${esc(PS.region)}</small><h3>써니(가명) · ${age}</h3><small>보호자 ${esc(s.user)} · 실습 ${s.attempt}회차</small></div>
        <div class="pcard"><h4>나의 양육역량</h4><div style="display:flex;align-items:center;gap:12px"><div class="big num" style="font-size:34px;color:var(--teal-d)">${s.index}</div><div style="font-size:12px" class="muted">돌봄 ${s.domain.care == null ? '—' : Math.round(s.domain.care)} · 안전 ${s.domain.safe == null ? '—' : Math.round(s.domain.safe)} · 응급 ${s.domain.emer == null ? '—' : Math.round(s.domain.emer)}<br>같은 과정 백분위 ${pctile(s.total)}</div></div></div>
        <div class="pcard"><h4>🔔 오늘의 맞춤 알림</h4>
          ${PS.days >= 0 && PS.days <= 90 && weak.some(w => w.k === 'neck' || w.k === 'tilt') ? `<div class="alert"><div class="ic">🤲</div><div><b>목 지지 주의 시기 (생후 3개월까지)</b><small>실습에서 머리 기울기 ${Math.round(M.tilt)}° — 3분 복습 영상</small></div></div>` : ''}
          ${weak.some(w => w.k === 'burp') ? `<div class="alert"><div class="ic">🫧</div><div><b>수유 후 바로 트림 자세</b><small>실습 첫 두드림 ${r1(M.burp)}초 · 표준 10~25초</small></div></div>` : ''}
          ${upcoming.map(x => `<div class="alert"><div class="ic">${x[2]}</div><div><b>${x[3]}</b><small>${x[4]} · ${x[0] - PS.days > 0 ? 'D-' + (x[0] - PS.days) : '지금 대상'} · 공공 일정</small></div></div>`).join('')}
          ${PS.days < 0 ? '<div class="alert"><div class="ic">🏥</div><div><b>출산 전 체크리스트</b><small>카시트 · 신생아 수면 환경 · 산후조리원 예약</small></div></div>' : ''}
        </div>
        <div class="pcard"><h4>🎓 추천 교육 (${esc(PS.region)} 보건소)</h4>${recs.map(c => `<div class="alert"><div class="ic">📚</div><div><b>${c.name}</b><small>${c.hrs}시간 · ${c.ch}</small></div></div>`).join('') || '<small class="muted">추천 과정 없음</small>'}</div>
        <div class="pcard"><h4>💳 받을 수 있는 출산지원</h4>
          <div class="alert"><div class="ic">🎁</div><div><b>첫만남이용권</b><small>국가 지원 바우처 · 신청 기한 확인</small></div></div>
          <div class="alert"><div class="ic">👶</div><div><b>부모급여</b><small>만 0~1세 · 매월 지급</small></div></div>
          <div class="alert"><div class="ic">🏛</div><div><b>${esc(PS.region)} 출산지원 사업</b><small>지역 예산 ${fmtN(r.budget)}억 · 보조금24 연계</small></div></div>
        </div>
        <div class="pcard" style="font-size:11px;color:var(--faint)">AI가 생성한 안내이며 의료적 판단을 대신하지 않습니다 · 접종 일정은 예방접종도우미 기준 확인 · 지원 금액은 연도별 변경</div>
      </div></div>
      <div class="grid" style="gap:14px">
        <div class="card"><h2>시연 조작</h2>
          <label class="f" style="margin-top:6px">아기 나이 · <span id="psDays">${age}</span><input type="range" min="-60" max="300" step="1" value="${PS.days}" id="psR"></label>
          <label class="f" style="margin-top:10px">거주 지역<select class="inp" id="psReg">${REGIONS.map(x => `<option ${x.name === PS.region ? 'selected' : ''}>${x.name}</option>`).join('')}</select></label>
          <p class="note" style="margin-top:8px">현재 리포트 기준 세션: ${esc(s.id)} (${esc(s.who)}) — 시뮬레이터에서 새 세션을 만들면 알림이 달라집니다.</p>
        </div>
        <div class="card"><h2>맞춤 알림이 만들어지는 방식</h2>
          <div class="grid g3" style="gap:8px;margin-top:6px">
            ${[['안전 성과 지표', '안전대응·CPR 점수', '응급·사고 통계', '사고↓ · 회피비용'], ['개인 맞춤 알림', '교육 이력·역량', '접종·검진 일정', '맞춤 케어 알림'], ['저출생 정책 효과', '역량 향상도', '예산·출생 데이터', '투입 대비 효과']].map(([t, a, b, c]) => `<div class="card" style="padding:12px;box-shadow:none"><b>${t}</b><div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:8px;font-size:12px"><span class="tag teal">${a}</span>+<span class="tag blue">${b}</span>=<span class="tag amber">${c}</span></div></div>`).join('')}
          </div>
        </div>
        <div class="card"><h2>브랜드 구조 (2층)</h2>
          <div style="font-size:13px;line-height:1.9">전국 최초 AI 아기돌봄 데이터 플랫폼 <b>「케어그래프(CareGraph)」</b><br>└ 대시보드 : 양육역량·안전 저출생 대시보드 <b>「베이비케어 인덱스」</b><br>└ 개인 구독 : 우리아기 맞춤 케어 리포트 <b>「베이비내비」</b></div>
          <p class="note" style="margin-top:6px">※ '전국 최초' 표현은 대외 사용 전 근거 확인 필요</p>
        </div>
      </div>
    </div>`;
    $('#psR').addEventListener('input', e => { $('#psDays').textContent = +e.target.value < 0 ? `출산 ${-e.target.value}일 전` : `생후 ${e.target.value}일`; });
    $('#psR').addEventListener('change', e => { PS.days = +e.target.value; renderers.personal(); });
    $('#psReg').addEventListener('change', e => { PS.region = e.target.value; renderers.personal(); });
  };

  // =====================================================================
  //  7. 구독 모델 — HW 판매(1.0) → 플랫폼 구독(2.0)
  // =====================================================================
  const BZ = { units: 60, price: 350, legacy: 150, conv: 30, ai: 60, pro: 20, fee: 80, proFee: 160, renew: 85, free: 1 };
  function bizCalc() {
    const yrs = [2027, 2028, 2029, 2030, 2031], ai = BZ.ai / 100, pro = BZ.pro / 100, rn = BZ.renew / 100;
    const perUnit = ai * BZ.fee + pro * BZ.proFee, mixFee = (ai + pro) ? perUnit / (ai + pro) : 0;
    return yrs.map((y, i) => {
      const hw = BZ.units * BZ.price;
      let sub = 0, subs = 0;
      for (let k = 0; k <= i; k++) { const age = i - k - BZ.free; if (age >= 0) { const f = Math.pow(rn, age); sub += BZ.units * perUnit * f; subs += BZ.units * (ai + pro) * f; } }
      const lg = BZ.legacy * BZ.conv / 100 * Math.pow(rn, i); sub += lg * mixFee; subs += lg;
      return { y, hw, sub: Math.round(sub), subs: Math.round(subs) };
    });
  }
  renderers.biz = function () {
    const R = bizCalc(), tot1 = R.reduce((a, r) => a + r.hw, 0), tot2 = R.reduce((a, r) => a + r.hw + r.sub, 0), last = R[R.length - 1];
    const mx = Math.max(...R.map(r => r.hw + r.sub)) * 1.1;
    const W = 560, H = 230, p = 40, bw = (W - p * 2) / R.length, y = v => H - 28 - v / mx * (H - 50);
    let chart = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto" font-family="Pretendard,sans-serif">`;
    [0, .5, 1].forEach(f => { const v = mx * f; chart += `<line x1="${p}" x2="${W - 10}" y1="${y(v)}" y2="${y(v)}" stroke="#eef1f6"/><text x="${p - 6}" y="${y(v) + 4}" text-anchor="end" font-size="10" fill="#9aa3b3">${(v / 10000).toFixed(1)}억</text>`; });
    R.forEach((r, i) => {
      const x = p + i * bw + bw * .2, w = bw * .6;
      chart += `<rect x="${x}" y="${y(r.hw)}" width="${w}" height="${H - 28 - y(r.hw)}" fill="#c9d3e3"/><rect x="${x}" y="${y(r.hw + r.sub)}" width="${w}" height="${y(r.hw) - y(r.hw + r.sub)}" fill="#13a089"/>`;
      chart += `<text x="${x + w / 2}" y="${y(r.hw + r.sub) - 6}" text-anchor="middle" font-size="10.5" font-weight="800" fill="#0d7a69">${((r.hw + r.sub) / 10000).toFixed(1)}억</text><text x="${x + w / 2}" y="${H - 10}" text-anchor="middle" font-size="11" fill="#3a4456">${r.y}</text>`;
    });
    chart += `<polyline points="${R.map((r, i) => (p + i * bw + bw / 2) + ',' + y(r.hw)).join(' ')}" fill="none" stroke="#d13b3b" stroke-width="2" stroke-dasharray="5 4"/>`;
    chart += `<text x="${W - 10}" y="14" text-anchor="end" font-size="10.5" fill="#13a089" font-weight="700">■ AI 구독(반복)</text><text x="${W - 120}" y="14" text-anchor="end" font-size="10.5" fill="#8a97ad" font-weight="700">■ 본체 판매</text><text x="${W - 210}" y="14" text-anchor="end" font-size="10.5" fill="#d13b3b" font-weight="700">┄ 1.0 (판매만)</text></svg>`;
    const inp = (k, l, u, min, max, step) => `<label class="f">${l}<div style="display:flex;align-items:center;gap:6px"><input type="range" min="${min}" max="${max}" step="${step}" value="${BZ[k]}" data-bz="${k}"><b class="num" style="min-width:64px;color:var(--ink)" id="bz-${k}">${BZ[k]}${u}</b></div></label>`;
    const F = [
      ['아기 로봇 · 센서 13종 · BabyCareCenter 2.0', 1, 1, 1], ['1.0 결과지 (점수 · 등급 · 레이더)', 1, 1, 1], ['오프라인 기본 교육 (AI 장애 시에도)', 1, 1, 1],
      ['AI Report ① 표준자세 vs 나의 자세', 0, 1, 1], ['AI Report ② 코호트 분포 속 나의 위치', 0, 1, 1], ['AI Report ③ 나의 반복 실습 비교 · 반복 실수 탐지', 0, 1, 1], ['AI 해석 · 맞춤 재교육 추천 · PDF', 0, 1, 1],
      ['AI Coach 1단계 · 텍스트 (선택형 + Q&A)', 0, 1, 1], ['AI Coach 2단계 · 음성', 0, '옵션', 1], ['AI Coach 3단계 · 개인화 상태모델', 0, '2028~', '2028~'],
      ['기관 대시보드 · 리포트 검토 · 반 관리', 0, 0, 1], ['기관 통계 Export · 다기관 운영', 0, 0, 1],
    ];
    const ck = v => v === 1 ? '<b class="ok">✓</b>' : v === 0 ? '<span class="note">—</span>' : `<span class="tag amber">${v}</span>`;
    $('#v-biz').innerHTML = head('⑦ 사업 모델', 'HW 판매(1.0) → 플랫폼 구독(2.0)', '한 번 팔고 끝나는 본체 판매에서, 실습할 때마다 가치가 쌓이는 AI Report · AI Coach 연간 구독으로 전환합니다.') + `
    <div class="grid g2">
      <div class="card" style="border-top:4px solid #9aa3b3">
        <div class="eyebrow" style="color:var(--muted)">SUNBABY 1.0 · 현재</div><h2 style="margin:4px 0 10px">HW 판매 모델</h2>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:13px"><span class="tag">본체 판매</span>→<span class="tag">실습</span>→<span class="tag">점수 결과지</span>→<span class="tag">끝</span></div>
        <ul style="margin:12px 0 0 16px;font-size:12.8px;color:var(--ink2);display:flex;flex-direction:column;gap:3px"><li>매출이 판매 시점 1회 · 설치 후 추가 매출 없음</li><li>결과지가 '다음 행동'으로 이어지지 않음</li><li>데이터가 태블릿에 남고 쌓이지 않음</li><li>경쟁: 수입 시뮬레이터(리포트 상용) · 무료 AI 체험</li></ul>
      </div>
      <div class="card" style="border-top:4px solid var(--teal)">
        <div class="eyebrow">SUNBABY 2.0 · 전환</div><h2 style="margin:4px 0 10px">플랫폼 + AI 구독 모델</h2>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:13px"><span class="tag">본체</span>+<span class="tag teal">AI Report</span>+<span class="tag teal">AI Coach</span>→<span class="tag navy">표준 모델 데이터</span>→<span class="tag amber">매년 갱신</span></div>
        <ul style="margin:12px 0 0 16px;font-size:12.8px;color:var(--ink2);display:flex;flex-direction:column;gap:3px"><li>신규 구매 시 AI 1년 포함(예시) → 2년 차부터 연 구독</li><li>기존 설치 고객도 구독 전환 가능 (데이터 인터페이스 호환 확인 후)</li><li>실습할수록 ③ 반복 비교가 깊어져 <b>계속 쓸 이유</b>가 생김</li><li>코호트가 커질수록 ② 비교가 정확해지는 네트워크 효과</li></ul>
      </div>
    </div>
    <div class="card mt">
      <div class="ch"><h2>구독할수록 가치가 쌓이는 구조</h2><span class="note">AI Report 3대 비교가 구독의 핵심 가치</span></div>
      <div class="grid g4" style="gap:8px">
        ${[['🧍', '① 표준 vs 나', '전문가 표준(S1)과 IMU로 자세 차이를 수치화', '표준 모델이 업데이트될수록 정밀'], ['👥', '② 코호트 vs 나', '같은 조건 교육생 분포 속 나의 위치', '설치·실습이 늘수록 n↑ 정확도↑'], ['📈', '③ 반복 vs 현재', '나의 이전 회차와 비교 · 반복 실수 탐지', '실습 횟수가 쌓일수록 가치↑ → 갱신 이유'], ['🤖', 'AI Coach', '약점 → 학습/실습/평가 모드 배정 · 대화형 훈련', '다음 실습을 만들어 사용량↑']].map(([i, t, d, v]) => `<div class="card" style="padding:12px;box-shadow:none"><div style="font-size:22px">${i}</div><b>${t}</b><p class="muted" style="font-size:12.3px">${d}</p><p style="font-size:11.8px;color:var(--teal-d);font-weight:700;margin-top:4px">${v}</p></div>`).join('')}
      </div>
      <p class="note" style="margin-top:8px">순환: 실습 → AI Report → 맞춤 재교육(AI Coach) → 재실습 → 반복 비교 → 데이터 축적 → 표준·코호트 고도화 → 구독 갱신</p>
    </div>
    <div class="card mt"><h2>제품 3종 · 기능 구성</h2>
      <div class="tw"><table class="t"><tr><th>기능</th><th>BASIC</th><th>AI <span class="tag teal">주력</span></th><th>AI PRO</th></tr>
        ${F.map(f => `<tr><td>${f[0]}</td><td>${ck(f[1])}</td><td>${ck(f[2])}</td><td>${ck(f[3])}</td></tr>`).join('')}
        <tr><td><b>과금</b></td><td>본체 1회 구매</td><td>본체 + 연 구독 (대당)</td><td>본체 + 연 구독 (기관)</td></tr>
        <tr><td><b>대상</b></td><td class="note">학교·교육기관 · AI 미도입</td><td class="note">AI 교육 도입 기관</td><td class="note">보건소 · 대학 · 기업 · 교육청</td></tr>
      </table></div>
      <p class="note" style="margin-top:6px">시연: AI Report 화면 상단 <b>BASIC (1.0) / AI 구독 (2.0)</b> 전환으로 같은 실습의 결과물 차이를 비교 · <a href="#report" data-go="report">AI Report 열기 →</a></p>
    </div>
    <div class="card mt">
      <div class="ch"><h2>매출 구조 시뮬레이션 (5년)</h2><span class="tag amber">모든 값은 예시 가정 · 가격 미정 (2026 Q4 가격 패키지 과제)</span></div>
      <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1.3fr);gap:18px;align-items:start">
        <div class="grid" style="gap:10px">
          ${inp('units', '연간 신규 판매 대수', '대', 10, 300, 10)}${inp('price', '본체 단가', '만원', 100, 800, 10)}${inp('legacy', '기존 설치 대수 (1.0)', '대', 0, 600, 10)}${inp('conv', '기존 설치 구독 전환율', '%', 0, 100, 5)}
          ${inp('ai', '신규 중 AI 선택 비율', '%', 0, 100, 5)}${inp('pro', '신규 중 AI PRO 비율', '%', 0, 100, 5)}${inp('fee', 'AI 구독료 (대당 연)', '만원', 20, 300, 10)}${inp('proFee', 'AI PRO 구독료 (대당 연)', '만원', 40, 500, 10)}${inp('renew', '연 갱신율', '%', 50, 100, 1)}
          <label class="f">신규 구매 시 AI 포함 기간<div class="seg" id="bzFree"><button data-v="0" class="${BZ.free === 0 ? 'on' : ''}">없음</button><button data-v="1" class="${BZ.free === 1 ? 'on' : ''}">1년 포함</button></div></label>
        </div>
        <div>
          ${chart}
          <div class="grid g4" style="gap:8px;margin-top:8px">
            <div class="card kpi" style="padding:10px;box-shadow:none"><div class="l">5년 누적 · 1.0</div><div class="v num" style="font-size:20px">${(tot1 / 10000).toFixed(1)}억</div></div>
            <div class="card kpi" style="padding:10px;box-shadow:none"><div class="l">5년 누적 · 2.0</div><div class="v num" style="font-size:20px;color:var(--teal-d)">${(tot2 / 10000).toFixed(1)}억</div><div class="d">+${tot1 ? Math.round((tot2 / tot1 - 1) * 100) : 0}%</div></div>
            <div class="card kpi" style="padding:10px;box-shadow:none"><div class="l">${last.y} 반복매출 비중</div><div class="v num" style="font-size:20px">${Math.round(last.sub / (last.hw + last.sub) * 100)}%</div></div>
            <div class="card kpi" style="padding:10px;box-shadow:none"><div class="l">${last.y} 구독 대수 · ARR</div><div class="v num" style="font-size:20px">${fmtN(last.subs)}대</div><div class="d">${(last.sub / 10000).toFixed(1)}억/년</div></div>
          </div>
          <div class="tw" style="margin-top:8px"><table class="t"><tr><th>연도</th>${R.map(r => `<th>${r.y}</th>`).join('')}</tr>
            <tr><td>본체 판매</td>${R.map(r => `<td class="num">${(r.hw / 10000).toFixed(1)}억</td>`).join('')}</tr>
            <tr><td>AI 구독</td>${R.map(r => `<td class="num ok">${(r.sub / 10000).toFixed(1)}억</td>`).join('')}</tr>
            <tr><td>구독 대수</td>${R.map(r => `<td class="num">${fmtN(r.subs)}</td>`).join('')}</tr></table></div>
          <p class="note" style="margin-top:6px">교육(TOT·강사) 매출과 B2G(CareGraph 지자체 구독) · B2C(베이비내비) 매출은 제외 · 기존 설치 전환은 2027년 일괄 가정</p>
        </div>
      </div>
    </div>
    <div class="grid g3 mt">
      ${[['1 Hardware', '본체 판매', '1.0과 동일 · 신생아형 외관 개선'], ['2 Recurring', 'AI Report · AI Coach 연 구독', '2.0 전환의 핵심 · 매년 갱신'], ['3 Data & Platform', '기관 라이선스 · B2G 대시보드 · B2C', '표준 모델 데이터 기반 확장']].map(([a, b, c]) => `<div class="card"><b>${a}</b><p style="font-size:13px;margin-top:4px">${b}</p><p class="note">${c}</p></div>`).join('')}
    </div>`;
    $$('#v-biz [data-bz]').forEach(el => {
      el.addEventListener('input', e => { $('#bz-' + el.dataset.bz).textContent = e.target.value + ($('#bz-' + el.dataset.bz).textContent.replace(/[\d.]/g, '')); });
      el.addEventListener('change', e => { BZ[el.dataset.bz] = +e.target.value; renderers.biz(); });
    });
    $$('#bzFree button').forEach(b => b.addEventListener('click', () => { BZ.free = +b.dataset.v; renderers.biz(); }));
  };

  // =====================================================================
  //  8. 로드맵 · 고려사항
  // =====================================================================
  renderers.roadmap = function () {
    const cols = ['2026 Q4', '2027 H1', '2027 H2', '2028', '2029', '장기'];
    const rows = [
      ['HW · 시뮬레이터', [[0, 1, '#d13b3b', '신생아형 외관 · 센서 13종 유지 · 데이터 인터페이스'], [2, 2, '#d13b3b', '기존 설치 호환 판단'], [5, 1, '#8b2a2a', '3.0 내부 AI 보드 · 자유대화형']]],
      ['플랫폼 · 표준 모델', [[0, 1, '#13a089', 'P0 데이터 정의 · 평가기준 표준화 R1.0'], [1, 2, '#13a089', '데이터레이크 · 코호트 · S2 프로파일'], [3, 3, '#0d7a69', 'K-PCI 표준지표 · 공공 API 결합']]],
      ['AI Report', [[0, 1, '#2f6fd6', 'MVP 기획·검증'], [1, 1, '#2f6fd6', 'R1 MVP 7종 · PDF'], [2, 2, '#1f4fa8', 'R2 행동패턴 · 유사사례'], [4, 2, '#13284d', 'R3 개인 구독 리포트']]],
      ['AI Coach', [[0, 1, '#b9791a', '프로토타입 기획'], [2, 1, '#b9791a', '1단계 텍스트'], [3, 1, '#9a6312', '2단계 음성'], [4, 2, '#7a4d0e', '3단계 상태모델 · 적응형']]],
      ['SW · 백오피스', [[1, 1, '#6a7487', '관리자 결과 조회 (P1)'], [2, 2, '#3a4456', 'AI PRO 기관 통계 · Export (P3)'], [4, 2, '#18202e', '다기관 · 교육청 운영']]],
      ['B2G · CareGraph', [[2, 1, '#13a089', '5극3특 초광역 시범 1곳'], [3, 2, '#0d7a69', '지자체 구독 · 인증체계'], [5, 1, '#13284d', '전국 표준']]],
      ['B2C · 베이비내비', [[3, 1, '#d13b3b', '베타 (보건소 연계)'], [4, 2, '#a32d2d', '개인 구독 · 맞춤 알림']]],
    ];
    const gantt = `<div class="gantt"><div class="gh" style="text-align:left">트랙</div>${cols.map(c => `<div class="gh">${c}</div>`).join('')}
      ${rows.map(([n, bars]) => `<div class="rl">${n}</div><div style="grid-column:span 6;padding:6px;display:grid;grid-template-columns:repeat(6,1fr);gap:4px;border-right:0">${bars.map(([s, w, c, t]) => `<div class="gb" style="grid-column:${s + 1} / span ${w};background:${c}">${t}</div>`).join('')}</div>`).join('')}</div>`;
    const checks = [
      ['데이터 · 개인정보', ['보호자·실습자 동의 분리 (교육 / 연구·코호트 / 지역 집계)', '가명 ID · 실명 열람 권한 · 접근 로그', '미성년 실습자(학교) 법정대리인 동의', '공공데이터와는 집계 단위로만 결합 (개인 결합 금지)']],
      ['AI 신뢰 · 법', ['Rule Engine이 판정, AI는 해석만 — 판정값 불변', 'AI 기본법 투명성: AI 이용 고지 · 생성물 표시', '승인된 지식 범위(RAG) 밖 질문 차단 · 로그', 'AI Report는 교수자 검토 후 발행']],
      ['현장 운영', ['오프라인 폴백 — AI 장애 시에도 수업 지속', '수업 소음·지연·비용 검증 (음성 Coach)', 'AI 호출 횟수 · 이용권 관리', '기존 설치 제품 데이터 인터페이스 호환']],
      ['표준 · 교육과정', ['평가기준 R1.0 표준위원회 승인 · 버전 관리', '표준 프로파일 전문가 확대 (S1 5인 → S2)', '공공데이터 기반 교육과정 → 보건소·교육청 인정 절차', 'TOT 6시간 · 강사 인증 · 커리큘럼(15과정 수준) 정비']],
      ['통계 · 근거', ['코호트 n ≥ 30 미만 비교 보류', '유사사례 추천 n ≥ 20 기준', '사고 감소·비용 회피 모형은 시범사업 데이터로 검증', "'전국 최초' 등 대외 표현 근거 확보"]],
      ['사업 · 조달', ['BASIC · AI · AI PRO 가격 패키지 · AI 포함 기간', 'B2G: 디지털서비스 전문계약 / 정보화 용역', '예산 경로: 보건사업비 · 정보화 · 저출생 대응', '공공데이터 이용약관 · 갱신 주기 SLA']],
    ];
    $('#v-roadmap').innerHTML = head('⑧ 계획', '개발 로드맵 · 고려사항', 'SUNBABY 1.0 → 2.0(AI Report · AI Coach) → AI 육아돌봄 데이터 플랫폼. 개발 기간 기준: AI Report MVP 약 3개월 + AI Coach 추가 2~3개월.') + `
    <div class="card">${gantt}<p class="note" style="margin-top:8px">※ AI 관련 일정은 계획이며 검증 실적 아님 · 음성 Coach 도입 시점은 1안(2027 베타) / 2안(P3 유지) 결정 필요</p></div>
    <div class="grid g3 mt">
      ${[['COACH 1단계 · 2027', '#b9791a', '텍스트 멘토', ['선택형 대화 + 짧은 텍스트 Q&A', '학습 · 실습 · 평가 3모드', '단계별 힌트 (질문 → 방향 → 구체)', '교육 콘텐츠 RAG 범위 제한', '오프라인 폴백 · 사전 탑재 안내'], '시뮬레이터 Coach 탭 "1 텍스트"'],
        ['COACH 2단계 · 2027~28', '#9a6312', '음성 멘토', ['태블릿 마이크 음성 질의 (STT)', '멘토 음성 답변 (TTS) · 즉답 유지', '이벤트 밖 일상 질의응답 (음성 챗봇)', '수업 소음 · 지연 · 비용 검증', '1안: 2027 베타 / 2안: AI PRO 단계'], '시뮬레이터 Coach 탭 "2 음성"'],
        ['COACH 3단계 · 2028~', '#7a4d0e', '개인화 · 상태모델', ['아기 기질(순둥이·보통·예민) 상태모델', '실습자 약점 기반 적응형 난이도', '행동 패턴 → 다음 연습 자동 제안', '개인 구독(베이비내비)으로 확장', '3.0 Interactive · Physical AI 연계'], '시뮬레이터 Coach 탭 "3 개인화"']].map(([lv, c, t, li, demo]) => `<div class="stagecard" style="border-top:4px solid ${c}"><div class="lv" style="color:${c}">${lv}</div><h3>${t}</h3><ul>${li.map(x => `<li>${x}</li>`).join('')}</ul><p class="note" style="margin-top:8px">시연: ${demo}</p></div>`).join('')}
    </div>
    <div class="grid g3 mt">
      ${[['REPORT R1 · 2027 H1', '#2f6fd6', 'AI Report MVP 7종', ['종합평가 · 영역별 강·약점', '위험행동 분석 · 반복 실수 탐지', '맞춤형 재교육 추천', '교육 전후 비교 · PDF 자동 생성']],
        ['REPORT R2 · 2027 H2', '#1f4fa8', '과정까지 분석', ['코호트 위치(백분위) · 표준자세 S1 비교', 'AI Coach 대화·힌트 과정 기록', '유사사례(n≥20) 기반 추천', '기관 대시보드 · 검토 워크플로']],
        ['REPORT R3 · 2029', '#13284d', '개인 · 지역으로', ['보호자용 개인 구독 리포트', '접종·검진 일정 결합 맞춤 알림', '지역 지표(K-PCI) 집계 · B2G', '정책 효과(투입 대비) 산출']]].map(([lv, c, t, li]) => `<div class="stagecard" style="border-top:4px solid ${c}"><div class="lv" style="color:${c}">${lv}</div><h3>${t}</h3><ul>${li.map(x => `<li>${x}</li>`).join('')}</ul></div>`).join('')}
    </div>
    <div class="grid g2 mt">
      <div class="card"><h2>제품 3종 · 수익 4단계</h2>
        <div class="tw"><table class="t"><tr><th>제품</th><th>구성</th><th>대상</th></tr>
          <tr><td><b>BASIC</b></td><td>아기 로봇 + 센서 + BabyCareCenter 2.0 + 기존 리포트</td><td>학교·교육기관, AI 미도입 기관</td></tr>
          <tr><td><b>AI</b> <span class="tag teal">주력</span></td><td>BASIC + AI Report + AI Coach</td><td>AI 교육 도입 기관 · 구매 후 연간 구독</td></tr>
          <tr><td><b>AI PRO</b></td><td>AI + Dashboard · 기관 통계 · 다수 교육생 관리 · Export</td><td>보건소 · 대학 · 기업 · 교육청</td></tr>
        </table></div>
        <div class="grid g4" style="margin-top:10px;gap:8px">${[['1 Hardware', '본체 판매'], ['2 Recurring', 'AI 연간 사용료'], ['3 Education', '교육 · TOT · 강사'], ['4 Data & Platform', 'B2G SaaS · B2C 구독']].map(([a, b]) => `<div class="card" style="padding:10px;box-shadow:none"><b style="font-size:12.5px">${a}</b><p class="note">${b}</p></div>`).join('')}</div>
        <p class="note" style="margin-top:8px">신규 구매 시 AI 서비스 1년 포함(예시) → 2년 차부터 갱신 · 한 번 판매한 제품에서 매년 매출</p>
      </div>
      <div class="card"><h2>2026 Q4 실행 과제</h2>
        ${['센서·이벤트 데이터 정리, 평가기준 표준화 (P0)', 'AI Report 검증 + AI 육아 멘토 프로토타입 기획 착수', 'AI Coach 시나리오 엔진 MVP · 오프라인 설계', 'BASIC·AI·AI PRO 가격 패키지 정리', 'AI 기본법 투명성 대응 정리', '결정 필요 · 음성 AI 도입 시점 (1안 베타 앞당김 / 2안 P3 유지)', '5극3특 초광역 시범 1곳 제안 (지방시대위원회)'].map(t => `<label class="chk"><input type="checkbox">${t}</label>`).join('')}
      </div>
    </div>
    <div class="card mt"><h2>고려사항 매트릭스</h2>
      <div class="grid g3" style="margin-top:6px">${checks.map(([t, li]) => `<div><h3 style="margin-bottom:4px">${t}</h3>${li.map(x => `<label class="chk"><input type="checkbox">${x}</label>`).join('')}</div>`).join('')}</div>
    </div>
    <p class="disclaim">출처: SUNBABY 2.0 AI 확장 계획(안) 내부보고(2026.09.20) · AI Report 가상 예시 · 썬베이비 케어 개념 정리(2024.06.11) · 지방시대위원회 정책 제안(1-page) · CareGraph 대시보드 시안. 본 시뮬레이션의 모든 수치는 예시입니다.</p>`;
  };

  // =====================================================================
  //  초기화
  // =====================================================================
  // L-0412의 이전 실습 이력 3회 (반복 실습 비교용 예시)
  [['novice', 20260908, '2026-09-08 10:20', 'learn'], ['novice', 20260922, '2026-09-22 14:05', 'practice'], ['normal', 20261006, '2026-10-06 09:40', 'practice']].forEach(([p, seed, date, mode], i) => {
    const x = headless({ course: 'demo', mode, level: 2, persona: p, stage: 1, temper: 'normal', label: `DEMO-00${i + 1}`, user: 'L-0412' }, seed);
    Object.assign(x, { attempt: i + 1, date, who: `${PERSONAS[p].name} (예시 이력)` });
    store.series.push(x);
  });
  store.base = store.series[store.series.length - 1];
  sessSeq = 0;
  lakeTxt();
  const start = (location.hash || '').slice(1);
  go(renderers[start] ? start : 'overview');
})();
