# pet-lifebook/util — 빌드·미디어 유틸리티

Pet Lifebook 데모를 만들 때 사용한 **Claude Code 생성 유틸 스크립트** 모음입니다.
사진 썸네일·앨범 큐레이션·영상 변환·추모(회상) 영상·배경음악·OG 카드·브로셔 캡처를
재현/재생성할 때 씁니다.

## 준비

모든 스크립트는 **`pet-lifebook/` 디렉터리에서** 실행합니다(상대경로 `assets/haru` 기준).

```bash
cd pet-lifebook
npm install            # sharp · @ffmpeg-installer/ffmpeg · puppeteer (util/package.json)
```

> `node_modules`, `util/.frames`·`.clips`·`.a` 임시폴더는 git에 올리지 않습니다(.gitignore).

## 스크립트

| 스크립트 | 하는 일 | 산출물 |
|---|---|---|
| `gen-thumbnails.js` | 원본 사진 → 420px 썸네일(스마트 크롭) + 메타 | `assets/haru/thumb/NNN.jpg`, `util/manifest.json` |
| `curate-album.js` | 흔들림(선명도)·중복(dHash)·저해상도 자동 선별 | `util/curated.json` (앱 갤러리용 대표 컷 목록) |
| `transcode-video.js <in> <name>` | 업로드 영상 회전 보정·압축·포스터 | `assets/haru/<name>.mp4` + `-poster.jpg` |
| `make-memorial-video.js` | 사진 슬라이드 → 페이드 회상 영상(무음) | `assets/haru/haru-memorial.mp4` |
| `make-audio.js` | 배경음악(피아노·숲소리) + 짖는 소리 데모 | `assets/haru/music-*.m4a`, `haru-bark.m4a` |
| `make-og-card.js` | 공유 썸네일(하루 정면 + 브랜드 카드) | `assets/haru/og-image.jpg` |
| `capture-brochure.js` | 앱 화면 캡처(브로셔용) | `assets/brochure/cap-*.png` |

## 실행 순서(전체 재생성 예시)

```bash
cd pet-lifebook
node util/gen-thumbnails.js          # 1) 썸네일 + manifest
node util/curate-album.js            # 2) 대표 컷 선별 → curated.json
node util/transcode-video.js assets/haru/V20230326_*.mp4 haru-walk-spring
node util/make-memorial-video.js     # 3) 회상 영상
node util/make-audio.js              # 4) 음악·짖는소리
node util/make-og-card.js            # 5) OG 카드
node util/capture-brochure.js        # 6) 브로셔 캡처
```

> `curated.json` / `manifest.json` 의 결과(대표 컷 목록·연도)는 앱 `app.html`의 `PHOTOS` 배열에
> 반영합니다. 인물(남자 얼굴) 제외 등 수동 보정은 그 배열에서 직접 합니다.

## 윤리 메모
- 추모 영상·소리는 **보존·회상** 톤으로만. 화장로/유골 등 자극적 장면은 제외.
- 음성은 **업로드된 자료에서 추출(보존)**, ‘되살림’ 표현 금지.
