# claude-project — 데모 프로젝트 모음

여러 데모 프로젝트를 폴더로 분리해 관리합니다.

- 공개 루트 **[index.html](index.html)** 은 프로젝트 목록이 없는 **최소 안내 페이지**입니다.
- 프로젝트 허브(전체 데모 목록)는 **관리자 전용**이며 **[admin.html](admin.html)** 에서 **비밀번호**로만 열립니다.

🔗 공개 루트: https://mistall2-beep.github.io/claude-project/
🔒 관리자 허브: https://mistall2-beep.github.io/claude-project/admin.html (비밀번호 필요)

## 프로젝트 (관리자 허브에 표시)

| 프로젝트 | 폴더 | 설명 | 링크 |
|---|---|---|---|
| ◍ **Life CareOS** | [`/lifecareos`](lifecareos/) | 복지관·지자체 내부의 Private AI가 흩어진 기록을 한 사람에 대한 이해(Life Care Profile)로 바꾸는 돌봄 운영체제. 6개 제품·순환 구조·근거 추적 인터랙티브 데모 | [제품소개](https://mistall2-beep.github.io/claude-project/lifecareos/) · [운영콘솔](https://mistall2-beep.github.io/claude-project/lifecareos/app.html) |
| 🌱 **lifeOS** | [`/lifeos`](lifeos/) | 개인의 일상·건강·일정을 관리하는 라이프 운영체제 데모 — 작가의 인터뷰 준비를 돕는 AI 코파일럿(자료수집→인물진단→질문지). 외부 `lifeos-demo` 저장소에서 **내부로 이전** | [데모](https://mistall2-beep.github.io/claude-project/lifeos/lifeos-demo/) · [소개](https://mistall2-beep.github.io/claude-project/lifeos/) |
| 🐾 **Pet Lifebook** | [`/pet-lifebook`](pet-lifebook/) | 반려동물의 흩어진 기억(사진·영상·음성·GPS·진료기록)을 AI가 읽어 한 권의 라이프북으로 엮는 Pet Memory OS | [제품소개](https://mistall2-beep.github.io/claude-project/pet-lifebook/) · [사용자화면](https://mistall2-beep.github.io/claude-project/pet-lifebook/app.html) · [브로셔](https://mistall2-beep.github.io/claude-project/pet-lifebook/brochure.html) |
| 💼 **알바ink** | [`/albaink`](albaink/) | 구인·구직(알바) 매칭 데모 — 구직자/구인자/관리자 + 모바일 앱 | [앱](https://mistall2-beep.github.io/claude-project/albaink/app.html) · [관리자](https://mistall2-beep.github.io/claude-project/albaink/admin.html) |
| 📄 **BriefOS** | [`/briefos`](briefos/) | 조직 커뮤니케이션을 1페이지로 재정의하는 B2B AI SaaS — 긴 보고서·공지를 AI가 독자 관점에서 재구조화해 1페이지로 압축하고 읽힘 데이터로 개선. 소개(사업계획서 v0.2) + AI 압축 엔진·템플릿·읽힘 분석·연동 인터랙티브 데모 | [소개](https://mistall2-beep.github.io/claude-project/briefos/) · [데모](https://mistall2-beep.github.io/claude-project/briefos/demo/) |

## 폴더 구조

```
claude-project/
├─ index.html            # 공개 루트 — 최소 안내 페이지 (프로젝트 목록 없음)
├─ admin.html            # 🔒 관리자 허브 — 비밀번호 게이트(내용 암호화), lifeOS 포함
├─ app.html, brochure.html  # (옛 링크 호환) → pet-lifebook/* 로 자동 이동
├─ lifecareos/           # ◍ Life CareOS — index.html(소개) app.html(운영 콘솔)
├─ lifeos/               # 🌱 lifeOS — index.html(소개) lifeos-demo/index.html(데모) og.png · 외부에서 내부 이전
├─ pet-lifebook/         # 🐾 Pet Lifebook
│  ├─ index.html app.html brochure.html comparison.html
│  └─ assets/{haru, brochure}/
├─ albaink/              # 💼 알바ink
│  └─ index.html app.html admin.html start.html styles.css assets/
├─ briefos/              # 📄 BriefOS — index.html(소개) demo/index.html(압축·분석 콘솔 데모)
└─ .github/workflows/pages.yml   # GitHub Pages 배포
```

## 접근 제어 메모
- **공개 루트(`/`)** 에는 프로젝트 목록이 노출되지 않습니다. 방문자는 어떤 데모가 있는지 알 수 없습니다.
- **관리자 허브(`/admin.html`)** 의 프로젝트 목록은 페이지에 **AES‑GCM으로 암호화**되어 들어 있고, 올바른 **비밀번호**를 입력해야 복호화·표시됩니다. (비밀번호는 이 저장소에 저장하지 않습니다.)
- GitHub Pages는 정적 호스팅이라 서버 인증이 없습니다. 이 게이트는 목록의 우발적 노출을 막는 **소프트 보호**이며, 개별 데모 URL을 이미 아는 사람은 해당 데모에 접근할 수 있습니다.

## 메모
- 각 프로젝트는 자기 폴더 안에서 **상대경로**로 동작하므로 독립적으로 열립니다.
- 허브에 카드를 추가하려면 빌드 스크립트로 `admin.html` 의 암호화 내용을 다시 생성합니다(평문 목록은 저장소에 두지 않음).
