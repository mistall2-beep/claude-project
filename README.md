# claude-project — 데모 프로젝트 모음

여러 데모 프로젝트를 폴더로 분리해 관리합니다. 루트의 **[index.html](index.html)** 이 프로젝트 허브(랜딩)입니다.

🔗 라이브: https://mistall2-beep.github.io/claude-project/

## 프로젝트

| 프로젝트 | 폴더 | 설명 | 링크 |
|---|---|---|---|
| 🐾 **Pet Lifebook** | [`/pet-lifebook`](pet-lifebook/) | 반려동물의 흩어진 기억(사진·영상·음성·GPS·진료기록)을 AI가 읽어 한 권의 라이프북으로 엮는 Pet Memory OS | [제품소개](https://mistall2-beep.github.io/claude-project/pet-lifebook/) · [사용자화면](https://mistall2-beep.github.io/claude-project/pet-lifebook/app.html) · [브로셔](https://mistall2-beep.github.io/claude-project/pet-lifebook/brochure.html) |
| 💼 **알바ink** | [`/albaink`](albaink/) | 구인·구직(알바) 매칭 데모 — 구직자/구인자/관리자 + 모바일 앱 | [앱](https://mistall2-beep.github.io/claude-project/albaink/app.html) · [관리자](https://mistall2-beep.github.io/claude-project/albaink/admin.html) |

## 폴더 구조

```
claude-project/
├─ index.html            # 프로젝트 허브(랜딩)
├─ app.html, brochure.html  # (옛 링크 호환) → pet-lifebook/* 로 자동 이동
├─ pet-lifebook/         # 🐾 Pet Lifebook
│  ├─ index.html app.html brochure.html comparison.html
│  └─ assets/{haru, brochure}/
├─ albaink/              # 💼 알바ink
│  └─ index.html app.html admin.html start.html styles.css assets/
└─ .github/workflows/pages.yml   # GitHub Pages 배포
```

## 메모
- 각 프로젝트는 자기 폴더 안에서 **상대경로**로 동작하므로 독립적으로 열립니다.
- 새 프로젝트는 루트에 새 폴더로 추가하고 `index.html` 허브에 카드 한 개를 추가하면 됩니다.
