/* SunBaby 2.0 시뮬레이션 — 표준 육아돌봄 모델 데이터 (시연용)
 * 출처: 썬베이비 케어 개념 정리(2024-06-11, 이벤트·사운드·점수표), SUNBABY 2.0 내부보고(2026-09-20),
 *       AI Report 가상 예시, 썬베이비 케어플러스 카드형 소개서.
 * 모든 수치는 시연용 예시이며 실측 결과가 아님. */
window.SB = (function () {
  // ---------- 13종 센서 ----------
  const SENSORS = [
    { id: 'S01', name: '머리·목 터치', grp: '접촉', code: 'touch_head' },
    { id: 'S02', name: '등 터치', grp: '접촉', code: 'touch_back' },
    { id: 'S03', name: '가슴 터치', grp: '접촉', code: 'touch_chest' },
    { id: 'S04', name: '배 터치', grp: '접촉', code: 'touch_belly' },
    { id: 'S05', name: '손 터치', grp: '접촉', code: 'touch_hand' },
    { id: 'S06', name: '가속도', grp: '자세', code: 'imu_acc' },
    { id: 'S07', name: '각속도(자이로)', grp: '자세', code: 'imu_gyro' },
    { id: 'S08', name: '자세 X·Y·Z', grp: '자세', code: 'imu_pose' },
    { id: 'S09', name: '입 자석(젖병)', grp: '자기', code: 'mag_mouth' },
    { id: 'S10', name: '귀 자석(체온계)', grp: '자기', code: 'mag_ear' },
    { id: 'S11', name: '기저귀 자석', grp: '자기', code: 'mag_diaper' },
    { id: 'S12', name: '소리(마이크)', grp: '환경', code: 'env_sound' },
    { id: 'S13', name: '빛(조도)', grp: '환경', code: 'env_light' },
  ];

  // ---------- 자세 모드 (pose) ----------
  const POSES = {
    lie: { name: '바로 눕히기', code: 'pose_03', rot: 0 },
    hold: { name: '안기·수유 자세', code: 'pose_01', rot: -35 },
    burp: { name: '어깨 트림 자세', code: 'pose_02', rot: -80 },
    play: { name: '마주 안기', code: 'pose_04', rot: -60 },
    prone: { name: '엎드려 놓기', code: 'pose_05', rot: 0, danger: true },
    upside: { name: '거꾸로 들기', code: 'pose_06', rot: 180, danger: true },
  };

  // ---------- 실습자 행동(시뮬레이터 조작) → 센서 ----------
  const ACTIONS = {
    neck: { name: '목 지지', sensors: ['S01'], kind: 'toggle', ico: '🤲' },
    bottle: { name: '젖병 입에 대기', sensors: ['S09'], kind: 'toggle', ico: '🍼' },
    pat: { name: '등 두드리기', sensors: ['S02', 'S06'], kind: 'toggle', ico: '✋' },
    rub: { name: '배 문지르기', sensors: ['S04'], kind: 'toggle', ico: '🫶' },
    rock: { name: '부드럽게 흔들기', sensors: ['S06', 'S07'], kind: 'toggle', ico: '〰️' },
    stroke: { name: '머리·볼 쓰다듬기', sensors: ['S01'], kind: 'toggle', ico: '💗' },
    hand: { name: '손 잡고 놀기', sensors: ['S05'], kind: 'toggle', ico: '🧸' },
    talk: { name: '말 걸기·노래', sensors: ['S12'], kind: 'toggle', ico: '🎵' },
    chest: { name: '가슴 압박', sensors: ['S03'], kind: 'toggle', ico: '❤️‍🩹' },
    ear: { name: '체온계 귀에 대기', sensors: ['S10'], kind: 'toggle', ico: '🌡️' },
    dim: { name: '조명 낮추기', sensors: ['S13'], kind: 'toggle', ico: '🌙' },
    shake: { name: '세게 흔들기', sensors: ['S06', 'S07'], kind: 'toggle', ico: '⚠️', danger: true },
    diaperOff: { name: '기저귀 떼기', sensors: ['S11'], kind: 'moment', ico: '🧷' },
    diaperOn: { name: '새 기저귀 채우기', sensors: ['S11'], kind: 'moment', ico: '🩲' },
  };

  // 점수표 (썬베이비 케어 개념 정리 · 기본 이벤트 점수표)
  const SCORE1 = [ // 1차 조건 완수 시간(초) → 점수
    { g: 'A', s: 50, max: 15 }, { g: 'B', s: 40, max: 30 }, { g: 'C', s: 30, max: 45 },
    { g: 'D', s: 20, max: 60 }, { g: 'E', s: 10, max: 120 }, { g: 'F', s: 0, max: Infinity },
  ];
  const SCORE2 = { done: { g: 'ㄱ', s: 50, t: '완료' }, partial: { g: 'ㄴ', s: 25, t: '미완료' }, none: { g: 'ㄷ', s: 0, t: '무반응' } };
  const SAFETY_GRADE = [ // 안전 평가 점수 기준 (5 → 1)
    { max: 5, g: 5, t: '정상처리' }, { max: 15, g: 4, t: '정상처리' }, { max: 30, g: 3, t: '처리미흡' },
    { max: 60, g: 2, t: '처리미흡' }, { max: Infinity, g: 1, t: '미처리' },
  ];
  const GRADE_MSG = [ // 평가서 · 일반 평가 평균 점수 기준 (아기 목소리)
    { min: 90, t: '최고에요. 정말 훌륭한 엄마 아빠가 될 준비가 되었네요.' },
    { min: 80, t: '잘하셨어요. 조금 더 저와 시간을 보내면 좋은 엄마 아빠가 될 거예요.' },
    { min: 70, t: '아직 엄마 아빠가 되기에는 조금 부족해요. 조금 더 노력하세요.' },
    { min: 50, t: '실망이에요. 저를 그렇게 돌보면 안돼요. 저는 약하고 보호받아야 한다고요!' },
    { min: 0, t: '정말 너무해요. 저를 존중하는 마음부터 가져 주세요.' },
  ];

  // ---------- 18종 이벤트 (일상돌봄 7 · 안전사고예방 8 · 영아응급처치 3) ----------
  // c1: 1차 조건(동시에 충족) · c2: 2차 완료 조건(누적 sec) · limit: 이벤트 최대 시간(초)
  const EVENTS = [
    { id: 'feed', cat: 'daily', name: '우유 먹이기', ico: '🍼', signal: '짧게 울기', snd: 'cry_02',
      c1: { need: ['pose:hold', 'bottle'], label: '안은 자세 + 젖병 입에 대기' },
      c2: { need: ['bottle'], sec: 60, label: '1분 우유 먹이기(누적)' }, limit: 300,
      ok: '웃음소리 2회 pt_01', ng: '길게 울기 cry_03', next: { id: 'burp', after: 30 },
      coach: { q: '아기가 짧게 3번 울어요. 마지막 수유 후 3시간이 지났어요. 무엇이 필요할까요?',
        ch: [{ t: '배가 고파요 — 수유 준비', ok: 1 }, { t: '졸려요 — 재우기', ok: 0 }, { t: '기저귀 확인', ok: 0 }],
        h: ['수유 간격을 떠올려 보세요. 신생아는 2~3시간마다 먹어요.', '먼저 머리와 목을 받쳐 안고, 젖병을 입에 대 주세요.', '젖병 꼭지를 입에 대고 1분 이상 유지하면 완료돼요.'] } },
    { id: 'burp', cat: 'daily', name: '트림 시키기', ico: '🫧', signal: '옹알이 반복', snd: 'pt_03',
      c1: { need: ['pose:burp', 'neck', 'pat'], label: '어깨 자세 + 목 지지 + 등 두드리기' },
      c2: { need: ['pat'], sec: 20, label: '등 쓸기·두드리기 20회(간격 ≥0.8초)' }, limit: 180,
      ok: '트림 2회 pt_05', ng: '거친 숨 2회 neg_03', fail: { id: 'airway', after: 120 },
      coach: { q: '수유가 끝났어요. 아기가 옹알이를 반복해요. 다음 순서는?',
        ch: [{ t: '바로 눕혀 재운다', ok: 0 }, { t: '어깨에 세워 안고 트림', ok: 1 }, { t: '놀아준다', ok: 0 }],
        h: ['수유 후 공기를 빼 주지 않으면 토하거나 기도가 막힐 수 있어요.', '아기를 어깨에 세워 안고, 한 손으로 목을 받쳐요.', '등을 아래에서 위로 부드럽게 20회 두드려요(0.8초 간격).'] } },
    { id: 'sleep', cat: 'daily', name: '잠재우기', ico: '🌙', signal: '짜증내기', snd: 'neg_02',
      c1: { need: ['pose:hold', 'rock'], label: '안고 부드럽게 흔들기' },
      c2: { need: ['pose:lie'], sec: 20, label: '바로 눕혀 20초 유지(롤 ±15°)' }, limit: 300,
      ok: '안정 숨소리 pt_04', ng: '칭얼대기 neg_01',
      coach: { q: '아기가 짜증을 내며 눈을 비벼요. 어떻게 할까요?',
        ch: [{ t: '안고 부드럽게 흔들어 재운다', ok: 1 }, { t: '세게 흔들어 빨리 재운다', ok: 0 }, { t: '엎드려 눕힌다', ok: 0 }],
        h: ['졸린 신호예요. 자극을 줄이고 안정시켜요.', '안은 자세에서 천천히, 작게 흔들어 주세요.', '잠들면 반드시 등을 바닥에 대고 바로 눕혀요(엎드려 재우기 금지).'] } },
    { id: 'wake', cat: 'daily', name: '관심 갖기', ico: '💗', signal: '옹알이', snd: 'pt_03',
      c1: { need: ['stroke'], label: '머리·볼 쓰다듬기' },
      c2: { need: ['talk'], sec: 20, label: '말 걸기 20초' }, limit: 180,
      ok: '웃음 pt_01', ng: '칭얼대기 neg_01',
      coach: { q: '잠에서 깬 아기가 주변을 두리번거려요. 무엇을 해줄까요?',
        ch: [{ t: '눈을 맞추고 말을 걸어준다', ok: 1 }, { t: '혼자 두고 지켜본다', ok: 0 }, { t: '바로 수유한다', ok: 0 }],
        h: ['깨어난 직후는 애착 형성에 좋은 시간이에요.', '머리나 볼을 쓰다듬어 반응해 주세요.', '눈을 맞추고 20초 이상 말을 걸어 주세요.'] } },
    { id: 'play', cat: 'daily', name: '놀아주기', ico: '🧸', signal: '옹알이 2', snd: 'pt_08',
      c1: { need: ['pose:play', 'hand'], label: '마주 안기 + 손 잡기' },
      c2: { need: ['hand', 'talk'], sec: 60, label: '손 놀이 + 말 걸기 1분' }, limit: 300,
      ok: '웃음 2 pt_02', ng: '칭얼대기 neg_01',
      coach: { q: '아기가 기분이 좋아 옹알이를 해요. 어떤 놀이가 좋을까요?',
        ch: [{ t: '마주 보고 손잡기 놀이', ok: 1 }, { t: '높이 던졌다 받기', ok: 0 }, { t: '스마트폰 영상 보여주기', ok: 0 }],
        h: ['신생아에게는 얼굴과 목소리가 최고의 장난감이에요.', '마주 안고 아기 손을 살짝 잡아 주세요.', '손 놀이를 하며 1분간 말을 걸어 주세요.'] } },
    { id: 'diaper', cat: 'daily', name: '기저귀 교체', ico: '🩲', signal: '칭얼대기', snd: 'neg_01',
      c1: { need: ['diaper:off'], label: '기저귀 떼기(자석 해제)' },
      c2: { need: ['diaper:new'], sec: 1, label: '새 기저귀 채우기' }, limit: 300,
      ok: '웃음 2 pt_02', ng: '짜증내기 neg_02',
      coach: { q: '수유도 했는데 아기가 칭얼대며 다리를 버둥거려요. 무엇을 확인할까요?',
        ch: [{ t: '기저귀 상태 확인', ok: 1 }, { t: '다시 수유', ok: 0 }, { t: '무시하고 기다린다', ok: 0 }],
        h: ['배고픔이 아니라면 불편함 신호일 수 있어요.', '아기를 바로 눕히고 기저귀를 떼어 확인해요.', '깨끗이 닦고 새 기저귀를 채우면 완료돼요.'] } },
    { id: 'colic', cat: 'daily', name: '배앓이 마사지', ico: '🫶', signal: '괴성 울기', snd: 'cry_05',
      c1: { need: ['pose:hold', 'rub'], label: '자세 잡기 + 배 문지르기' },
      c2: { need: ['rub'], sec: 120, label: '배 문지르기 2분 지속(3초 정지 시 중단)' }, limit: 300,
      ok: '안정 숨 pt_04', ng: '길게 울기 cry_03',
      coach: { q: '아기가 다리를 배 쪽으로 당기며 크게 울어요. 원인과 대응은?',
        ch: [{ t: '배앓이 — 안고 배 마사지', ok: 1 }, { t: '배고픔 — 수유', ok: 0 }, { t: '졸림 — 재우기', ok: 0 }],
        h: ['다리를 당기며 자지러지게 우는 건 배앓이 신호일 수 있어요.', '아기를 안정된 자세로 잡고 배에 손을 대요.', '시계 방향으로 2분 이상 멈추지 말고 문질러요.'] } },

    { id: 'prone', cat: 'safety', name: '엎드려 놓기', ico: '⚠️', signal: '크게 울기', snd: 'cry_04', fix: ['pose:lie'], fixLabel: '즉시 바로 눕히기', trig: 'pose_05 20초',
      coach: { h: ['엎드린 자세는 영아돌연사 위험이 있어요. 즉시 바로 눕혀요.'] } },
    { id: 'neckdrop', cat: 'safety', name: '고개 꺾임', ico: '⚠️', signal: '크게 울기', snd: 'cry_04', fix: ['neck'], fixLabel: '목 지지', trig: 'pose_07 가속도',
      coach: { h: ['들어 올릴 때 머리가 젖혀졌어요. 한 손으로 목과 머리를 받쳐요.'] } },
    { id: 'upside', cat: 'safety', name: '거꾸로 들기', ico: '⚠️', signal: '괴성', snd: 'cry_05', fix: ['pose:hold', 'neck'], fixLabel: '바로 안고 목 지지', trig: 'pose_06 120~301°',
      coach: { h: ['아기를 거꾸로 들면 위험해요. 바로 안고 목을 받쳐요.'] } },
    { id: 'shaken', cat: 'safety', name: '세게 흔들림', ico: '⚠️', signal: '길게 울기', snd: 'cry_03', fix: ['!shake', 'stroke'], fixLabel: '흔들기 중단 + 달래기', trig: '각속도 임계 초과',
      coach: { h: ['세게 흔들면 흔들린아이증후군 위험이 있어요. 멈추고 쓰다듬어 달래요.'] } },
    { id: 'flip', cat: 'safety', name: '뒤집기', ico: '⚠️', signal: '짧게 울기', snd: 'cry_02', fix: ['pose:lie'], fixLabel: '바로 눕히기', trig: '수면 중 롤 >90°',
      coach: { h: ['자다가 뒤집혔어요. 얼굴이 묻히지 않게 바로 눕혀요.'] } },
    { id: 'noise', cat: 'safety', name: '큰소리', ico: '🔊', signal: '크게 울기', snd: 'cry_04', fix: ['pose:hold', 'stroke'], fixLabel: '안고 달래기', trig: '소음 >85dB',
      coach: { h: ['큰 소리에 놀랐어요. 안아서 쓰다듬으며 안심시켜요.'] } },
    { id: 'light', cat: 'safety', name: '불빛 감지', ico: '💡', signal: '칭얼대기', snd: 'neg_01', fix: ['dim'], fixLabel: '조명 낮추기', trig: '조도 급상승',
      coach: { h: ['강한 빛이 아기 눈에 닿았어요. 조명을 낮춰 주세요.'] } },
    { id: 'bath', cat: 'safety', name: '목욕 시 주의', ico: '🛁', signal: '짧게 울기', snd: 'cry_02', fix: ['pose:hold', 'neck'], fixLabel: '안은 자세 + 목 지지', trig: '목욕 모드 자세 이탈',
      coach: { h: ['목욕 중에는 머리가 물에 잠기지 않게 항상 목을 받쳐요.'] } },

    { id: 'cpr', cat: 'emer', name: '심정지', ico: '🫀', signal: '심정지 알림', snd: 'pa_01b',
      c1: { need: ['chest'], label: '가슴 센서 인식(압박 시작)' },
      c2: { need: ['chest'], sec: 30, label: '손 떼지 않고 30초 압박' }, limit: 120,
      ok: '안정 숨 pt_04', ng: '경보 alarm004',
      coach: { q: '아기가 반응이 없고 숨을 쉬지 않아요. 가장 먼저 할 일은?',
        ch: [{ t: '119 신고 후 가슴 압박 시작', ok: 1 }, { t: '물을 먹인다', ok: 0 }, { t: '흔들어 깨운다', ok: 0 }],
        h: ['반응·호흡이 없으면 즉시 119에 알리고 CPR을 시작해요.', '젖꼭지 연결선 바로 아래 가슴 중앙을 두 손가락으로 눌러요.', '분당 100~120회 속도로 손을 떼지 말고 30초 이상 계속해요.'] } },
    { id: 'airway', cat: 'emer', name: '기도폐쇄', ico: '🫁', signal: '기도폐쇄 알림', snd: 'pa_02b',
      c1: { need: ['pat'], label: '등 두드리기(등 센서 3회 이상)' },
      c2: { need: ['chest'], sec: 10, label: '가슴 압박 10초 지속' }, limit: 120,
      ok: '안정 숨 pt_04', ng: '경보 alarm004',
      coach: { q: '트림이 안 된 뒤 아기가 숨을 못 쉬고 얼굴이 파래져요. 대응은?',
        ch: [{ t: '등 두드리기 5회 → 가슴 밀기 5회', ok: 1 }, { t: '입에 손가락을 넣어 꺼낸다', ok: 0 }, { t: '물을 먹인다', ok: 0 }],
        h: ['영아 기도폐쇄는 등 두드리기와 가슴 밀어내기를 번갈아 해요.', '아기를 팔 위에 엎드려 받치고 등을 세게 5회 두드려요.', '뒤집어 가슴 중앙을 두 손가락으로 5회 밀어요(10초 이상).'] } },
    { id: 'fever', cat: 'emer', name: '발열', ico: '🌡️', signal: '발열 알림', snd: 'pa_03b',
      c1: { need: ['ear'], label: '귀 센서 인식' },
      c2: { need: ['ear'], sec: 3, label: '귀 체온 3초 이상 측정' }, limit: 120,
      ok: '안정 숨 pt_04', ng: '괴성 cry_05',
      coach: { q: '아기 몸이 뜨겁고 보채요. 가장 먼저 할 일은?',
        ch: [{ t: '귀 체온을 정확히 잰다', ok: 1 }, { t: '두꺼운 이불을 덮는다', ok: 0 }, { t: '해열제를 바로 먹인다', ok: 0 }],
        h: ['발열 여부를 먼저 정확히 확인해요.', '체온계를 귀에 대 주세요.', '3초 이상 유지하면 측정이 완료돼요. 3개월 미만 38℃ 이상이면 바로 진료를 받아요.'] } },
  ];
  const EV = Object.fromEntries(EVENTS.map(e => [e.id, e]));
  const CAT = { daily: '일상돌봄', safety: '안전사고예방', emer: '영아응급처치' };

  // ---------- 과정(시나리오) ----------
  // t: 시뮬레이션 초. 일상·응급은 순차 큐, 안전은 동시 알림으로 발생.
  const COURSES = {
    demo: { name: '체험 데모 · 30분 압축 (8개 이벤트)', len: 1800, list: [
      { t: 5, id: 'feed' }, { t: 200, id: 'diaper' }, { t: 330, id: 'noise' }, { t: 420, id: 'colic' },
      { t: 700, id: 'sleep' }, { t: 1000, id: 'flip' }, { t: 1150, id: 'fever' }, { t: 1350, id: 'play' }] },
    a001: { name: '3시간 A모드 · a_001 (엑셀 시간표)', len: 10800, list: [
      { t: 360, id: 'feed' }, { t: 2520, id: 'diaper' }, { t: 3300, id: 'light' }, { t: 4080, id: 'sleep' },
      { t: 5000, id: 'flip' }, { t: 8280, id: 'wake' }, { t: 9400, id: 'cpr' }] },
    emer: { name: '영아응급처치 집중 (심화 · 평가용)', len: 900, list: [
      { t: 5, id: 'cpr' }, { t: 260, id: 'airway' }, { t: 520, id: 'fever' }, { t: 700, id: 'bath' }] },
    single: { name: '단일 이벤트 연습', len: 600, list: [] },
  };

  // 자동 실습자 페르소나 (시연용)
  const PERSONAS = {
    expert: { name: '숙련 실습자', react: [2, 4], wrong: 0.05, quit: 0.03, neckMiss: 0.05, shake: 0, fix: [2, 5], choice: 0.95, hintAsk: 0.05 },
    normal: { name: '보통 실습자', react: [5, 16], wrong: 0.2, quit: 0.2, neckMiss: 0.35, shake: 0.05, fix: [5, 18], choice: 0.75, hintAsk: 0.3 },
    novice: { name: '초보 실습자', react: [10, 32], wrong: 0.35, quit: 0.35, neckMiss: 0.6, shake: 0.2, fix: [12, 45], choice: 0.5, hintAsk: 0.6 },
  };
  const TEMPERAMENTS = {
    easy: { name: '순둥이', mul: 0.8, desc: '반응이 빠르고 쉽게 진정' },
    normal: { name: '보통', mul: 1.0, desc: '표준 프로파일' },
    sensitive: { name: '예민', mul: 1.4, desc: '진정까지 더 오래, 신호가 강함' },
  };

  // ---------- 표준 프로파일 S1 (전문가 5인 × 5회 · IMU) ----------
  const STD = [
    { k: 'react', task: '울음 발생 · 반응시간', sensor: '가속도', std: '3초', lo: 2, hi: 5, warn: 8, unit: '초', safety: false, cohortMed: 4, n: 228 },
    { k: 'neck', task: '목 지지 · 허용각 초과 (들어올리기당)', sensor: '자세+각속도', std: '0회', lo: 0, hi: 1, warn: 1, unit: '회', safety: true },
    { k: 'tilt', task: '안아 올리기 · 머리 기울기 최대', sensor: '자세', std: '10°', lo: 0, hi: 20, warn: 25, unit: '°', safety: true },
    { k: 'burp', task: '트림 · 첫 두드림까지 시간', sensor: '가속도', std: '15초', lo: 10, hi: 25, warn: 35, unit: '초', safety: false, cohortMed: 28, n: 180 },
    { k: 'gyro', task: '달래기 · 각속도 최대', sensor: '각속도', std: '기준 이하', lo: 0, hi: 1, warn: 1, unit: '', safety: true },
    { k: 'roll', task: '수면 · 눕힌 자세(롤)', sensor: '자세', std: '바로 누움 ±15°', lo: 0, hi: 15, warn: 30, unit: '°', safety: true },
  ];

  // ---------- 승인된 교육 콘텐츠 KB (RAG 범위 제한 시뮬레이션) ----------
  const KB = [
    { k: ['수유', '우유', '분유', '젖병', '먹'], a: '신생아는 보통 2~3시간 간격, 1회 60~90mL로 시작해요. 젖병은 45° 기울여 꼭지에 공기가 차지 않게 하고, 수유 후에는 꼭 트림을 시켜요.', src: '교육콘텐츠 KB · 수유 1.2' },
    { k: ['트림', '토', '게워'], a: '어깨에 세워 안고 목을 받친 채 등을 아래에서 위로 부드럽게 두드려요. 5~10분 해도 트림이 없으면 잠시 세워 안아 두세요. 분수처럼 반복해 토하면 진료가 필요해요.', src: '교육콘텐츠 KB · 수유 2.1' },
    { k: ['잠', '수면', '재우', '엎드'], a: '아기는 반드시 등을 대고 바로 눕혀 재워요. 푹신한 이불·베개·인형은 치우고, 엎드려 재우기는 영아돌연사 위험이 있어 금지예요.', src: '교육콘텐츠 KB · 안전수면 1.0' },
    { k: ['목', '머리', '안아', '안기', '들어'], a: '생후 3개월까지는 목을 가누지 못해요. 들어 올릴 때는 한 손으로 머리와 목, 다른 손으로 엉덩이를 받쳐요. 머리 기울기 20° 이내가 표준이에요.', src: '교육콘텐츠 KB · 안기 1.1 · 표준자세 S1' },
    { k: ['흔들', '흔들린'], a: '아기를 세게 흔들면 뇌 손상(흔들린아이증후군)이 생길 수 있어요. 달랠 때는 작고 느리게 흔들고, 화가 날 땐 아기를 안전한 곳에 눕히고 잠시 자리를 피하세요.', src: '교육콘텐츠 KB · 안전 3.2' },
    { k: ['배앓이', '영아산통', '배'], a: '배앓이는 다리를 당기며 자지러지게 우는 것이 특징이에요. 안정된 자세에서 시계 방향으로 배를 마사지하고, 울음이 3시간 이상 이어지거나 발열이 있으면 진료를 받으세요.', src: '교육콘텐츠 KB · 배앓이 1.0' },
    { k: ['열', '체온', '발열', '해열'], a: '귀 체온 38℃ 이상이면 발열이에요. 생후 3개월 미만은 38℃ 이상이면 바로 소아과나 응급실을 방문해요. 해열제는 의사 지시에 따라 체중별 용량으로 사용해요.', src: '교육콘텐츠 KB · 응급 3.0' },
    { k: ['심정지', 'cpr', '심폐', '압박', '숨'], a: '반응·호흡이 없으면 119에 신고하고, 가슴 중앙을 두 손가락으로 4cm 깊이, 분당 100~120회 압박해요. 30회 압박 후 2회 인공호흡을 반복해요.', src: '교육콘텐츠 KB · 영아 CPR 1.0' },
    { k: ['기도', '막혔', '질식', '사레'], a: '기침을 못 하고 숨을 못 쉬면 팔 위에 엎드려 받쳐 등을 5회 두드리고, 뒤집어 가슴을 5회 밀어요. 이물질이 나오거나 의식을 잃을 때까지 반복하고 119에 알려요.', src: '교육콘텐츠 KB · 기도폐쇄 1.0' },
    { k: ['기저귀', '발진', '엉덩이'], a: '기저귀는 2~3시간마다 또는 젖었을 때 바로 갈아요. 여아는 앞에서 뒤로 닦고, 완전히 말린 뒤 채우면 발진을 줄일 수 있어요.', src: '교육콘텐츠 KB · 위생 1.0' },
    { k: ['놀이', '놀아', '발달', '애착', '눈'], a: '신생아는 20~30cm 거리의 얼굴을 가장 잘 봐요. 눈을 맞추고 말을 걸거나 손을 잡아 주는 상호작용이 애착과 발달에 가장 좋아요.', src: '교육콘텐츠 KB · 발달 1.0' },
    { k: ['접종', '예방', '검진'], a: '출생 직후 B형간염 1차, 4주 이내 BCG, 2개월부터 DTaP·폴리오·Hib·폐렴구균 등을 맞아요. 영유아 건강검진 1차는 생후 14~35일이에요. 정확한 일정은 예방접종도우미에서 확인하세요.', src: '교육콘텐츠 KB · 보건 1.0 (질병관리청 일정 기반)' },
  ];

  // ---------- 지역 · 공공데이터 (시연용 예시값) ----------
  const REGIONS = [
    ['서울', 84, 0.58, 3420, 96.1, 88.2, 1210, 9, 62], ['부산', 76, 0.68, 1080, 95.2, 86.0, 520, 4, 35],
    ['대구', 74, 0.75, 820, 94.8, 85.1, 410, 3, 30], ['인천', 80, 0.73, 1270, 95.6, 87.0, 560, 4, 40],
    ['광주', 78, 0.71, 610, 95.0, 86.4, 290, 2, 25], ['대전', 82, 0.79, 680, 95.9, 87.9, 300, 3, 28],
    ['울산', 73, 0.88, 520, 94.5, 84.7, 250, 2, 22], ['세종', 88, 1.03, 290, 97.0, 90.3, 160, 1, 18],
    ['경기', 86, 0.79, 6200, 96.3, 88.8, 2580, 18, 120], ['강원', 70, 0.92, 640, 93.8, 83.0, 380, 7, 32],
    ['충북', 75, 0.89, 650, 94.6, 85.2, 360, 5, 30], ['충남', 81, 0.88, 920, 95.4, 86.9, 470, 8, 41],
    ['전북', 72, 0.80, 600, 94.1, 84.1, 360, 6, 30], ['전남', 71, 0.97, 720, 93.9, 83.5, 400, 9, 33],
    ['경북', 69, 0.90, 930, 93.5, 82.6, 500, 10, 38], ['경남', 77, 0.82, 1270, 95.1, 85.9, 610, 9, 45],
    ['제주', 83, 0.83, 280, 95.8, 87.5, 150, 2, 15],
  ].map(([name, idx, tfr, births, vacc, check, budget, ctrs, edu]) => ({ name, idx, tfr, births, vacc, check, budget, ctrs, edu }));
  // name, 양육역량지수, 합계출산율, 월 출생아(명), 예방접종 적기율(%), 영유아검진 수검률(%), 출산지원 예산(억), 거점 보건소(수), 연 교육 회차(×10)

  const BORYEONG = [
    ['대천1동', 86, 'hc'], ['대천2동', 83, ''], ['대천3동', 79, ''], ['대천4동', 75, ''], ['대천5동', 88, 'pc'],
    ['죽정동', 72, ''], ['웅천읍', 81, 'sc'], ['주포면', 68, ''], ['주산면', 64, ''], ['미산면', 59, 'gap'],
    ['성주면', 62, ''], ['청라면', 66, ''], ['오천면', 74, 'sc'], ['천북면', 61, 'gap'], ['남포면', 70, ''],
  ].map(([name, idx, mark]) => ({ name, idx, mark }));

  const PUBLIC_APIS = [
    { name: '출생·합계출산율', org: '통계청 KOSIS 인구동향조사', cycle: '월/연', key: 'tfr, births', use: '맥락 지표 · 지역 비교' },
    { name: '예방접종 적기율', org: '질병관리청 예방접종 통계', cycle: '연', key: 'vacc', use: '개인 맞춤 알림 · 지역 갭' },
    { name: '영유아 건강검진 수검률', org: '국민건강보험공단', cycle: '연', key: 'check', use: '교육과정 추천 · 지역 갭' },
    { name: '산후조리원·보건소 분포', org: '공공데이터포털 표준데이터', cycle: '분기', key: 'ctrs', use: '길목(거점) 커버리지' },
    { name: '출산지원 예산·바우처', org: '지자체 예산서 · 보조금24', cycle: '연', key: 'budget', use: '투입 대비 효과 · 혜택 안내' },
  ];

  // 공공데이터 + 역량 데이터 → 교육과정 추천 규칙
  const CURRICULUM = [
    { id: 'M1', name: '안전수면·목 지지 집중', hrs: 2, who: '예비부모·조부모', ch: '보건소 예비부모교실', rule: r => r.safety < 78, why: '안전 영역 역량 < 78' },
    { id: 'M2', name: '영아 CPR·기도폐쇄 심화', hrs: 3, who: '보육교사·예비부모', ch: '보건소·소방서 연계', rule: r => r.emer < 76, why: '응급 영역 역량 < 76' },
    { id: 'M3', name: '영유아 건강검진·발달 체크', hrs: 1, who: '0~6개월 양육자', ch: '산후조리원·보건소', rule: r => r.check < 86, why: '검진 수검률 < 86% (건보공단)' },
    { id: 'M4', name: '예방접종 일정 관리 + 알림 등록', hrs: 1, who: '출산 가정', ch: '보건소 모바일 알림', rule: r => r.vacc < 95, why: '접종 적기율 < 95% (질병청)' },
    { id: 'M5', name: '산후 초기 가정돌봄 집중과정', hrs: 3, who: '퇴원 직후 가정', ch: '방문간호 · 원격', rule: r => r.ctrs <= 3, why: '거점 보건소·조리원 ≤ 3 (공공데이터포털)' },
    { id: 'M6', name: '청소년 생명존중·부모체험', hrs: 2, who: '중·고등학생', ch: '학교 자유학기 · 교육청', rule: r => r.tfr < 0.75, why: '합계출산율 < 0.75 (KOSIS)' },
    { id: 'M7', name: '일상돌봄 기본 7종', hrs: 3, who: '예비부모', ch: '보건소·대학', rule: () => true, why: '기본 과정(전 지역 공통)' },
  ];

  // 기관 실습자 (가명) — AI Report 가상 예시 기반
  const TRAINEES = [
    { id: 'L-0401', cls: '2-A', s: 76, sess: 2, r: ['ok', 'ok', 'ok', 'warn', 'ok', 'ok'], st: '발행됨', re: '완료' },
    { id: 'L-0403', cls: '2-B', s: 69, sess: 2, r: ['warn', 'out', 'out', 'out', 'ok', 'ok'], st: '전송 대기', re: '재평가 대기' },
    { id: 'L-0405', cls: '2-A', s: 81, sess: 1, r: ['ok', 'ok', 'warn', 'ok', 'ok', 'ok'], st: '발행됨', re: '없음' },
    { id: 'L-0407', cls: '2-A', s: 82, sess: 3, r: ['warn', 'warn', 'ok', 'warn', 'ok', 'out'], st: '검토 필요', re: '완료' },
    { id: 'L-0408', cls: '2-A', s: 88, sess: 2, r: ['ok', 'ok', 'ok', 'ok', 'ok', 'ok'], st: '발행됨', re: '없음' },
    { id: 'L-0410', cls: '2-B', s: 71, sess: 2, r: ['out', 'warn', 'out', 'warn', 'ok', 'ok'], st: '검토 필요', re: '배정됨' },
    { id: 'L-0412', cls: '2-B', s: 78, sess: 1, r: ['warn', 'out', 'out', 'out', 'ok', 'ok'], st: '검토 필요', re: '배정됨' },
    { id: 'L-0415', cls: '2-A', s: 85, sess: 2, r: ['ok', 'ok', 'warn', 'ok', 'warn', 'ok'], st: '발행됨', re: '없음' },
  ];

  return { SENSORS, POSES, ACTIONS, SCORE1, SCORE2, SAFETY_GRADE, GRADE_MSG, EVENTS, EV, CAT, COURSES, PERSONAS, TEMPERAMENTS, STD, KB, REGIONS, BORYEONG, PUBLIC_APIS, CURRICULUM, TRAINEES };
})();
