# Transmission URL Supporter

Chrome 확장 프로그램으로 마그넷 링크와 토렌트 파일을 Transmission 비트토렌트 클라이언트에 쉽게 업로드할 수 있습니다.

## 주요 기능

- 🔗 마그넷 링크 우클릭으로 Transmission 서버에 직접 업로드
- 🧩 페이지 내 마그넷/해시 옆 인라인 업로드 버튼 지원
- ⚙️ Transmission 서버 설정 저장
- 🔔 업로드 상태 알림
- 🛡️ `activeTab` 기반 최소 권한 동작

## 설치 방법

### Chrome Web Store에서 설치 (추천)
1. [Chrome Web Store]()에서 "Transmission URL Supporter" 검색
2. "Chrome에 추가" 버튼 클릭
3. 설치 확인

### 수동 설치 (개발 버전)
1. 이 리포지토리를 클론하거나 ZIP 파일 다운로드
2. Chrome 브라우저에서 `chrome://extensions/` 열기
3. 우측 상단 "개발자 모드" 활성화
4. "압축해제된 확장 프로그램을 로드합니다" 클릭
5. 압축 해제한 폴더 선택

## 사용 방법

### 초기 설정
1. 확장 프로그램 아이콘 클릭
2. 옵션 페이지에서 Transmission 서버 정보 입력:
   - 서버 주소 (예: `http://localhost:9091`)
   - 사용자 이름 (선택사항)
   - 비밀번호 (선택사항)

### activeTab 권한 방식
1. 확장 기능을 사용할 탭에서 확장 아이콘을 클릭
2. 해당 탭에 컨텐츠 스크립트가 주입되고, 사이트 origin이 저장됨
3. 저장된 사이트는 배지 `ON`으로 표시됨

주의: `activeTab` 특성상 자동 상시 실행이 아니라 사용자 액션(아이콘 클릭/우클릭 메뉴 클릭) 기반으로 동작합니다.

### 마그넷 링크 업로드
1. 마그넷 링크 우클릭
2. "Transmission에 업로드" 선택

### 토렌트 파일 업로드
1. `.torrent` 링크를 우클릭
2. "Transmission에 업로드" 선택

## 다국어 지원 (i18n)

이 확장 프로그램은 Chrome 확장 프로그램의 표준 i18n 시스템을 사용하여 다국어를 지원합니다.

### 지원 언어
- **English (en)**: 기본 언어
- **한국어 (ko)**: 한국어 지원

### 언어 추가 방법
새로운 언어를 추가하려면 다음 단계를 따르세요:

1. **로케일 폴더 생성**
   ```bash
   mkdir -p _locales/{language_code}
   ```

2. **메시지 파일 생성**
   `_locales/{language_code}/messages.json` 파일을 생성하고 영어 버전을 번역하세요.

3. **Pull Request 제출**
   새로운 언어 파일을 포함한 Pull Request를 제출하세요.

### 메시지 키 구조
- `appName`: 확장 프로그램 이름
- `appDescription`: 확장 프로그램 설명
- `popup*`: 팝업 UI 관련 메시지
- `settings*`: 설정 페이지 관련 메시지
- `notification*`: 알림 메시지
- `contextMenu*`: 우클릭 메뉴 텍스트
- `status*`: 상태 표시 텍스트

### 개발자 참고사항
- 기본 언어는 영어(`en`)입니다
- 새로운 메시지를 추가할 때는 영어와 한국어 버전을 모두 업데이트하세요
- HTML에서는 `data-i18n` 속성을 사용하세요
- JavaScript에서는 `chrome.i18n.getMessage()`를 사용하세요

## 개발 정보

### 파일 구조
```
├── _locales/             # 다국어 메시지 파일들
│   ├── en/messages.json  # 영어 메시지
│   └── ko/messages.json  # 한국어 메시지
├── manifest.json          # 확장 프로그램 매니페스트
├── background.js          # 백그라운드 서비스 워커
├── content.js             # 컨텐츠 스크립트
├── popup.html            # 팝업 UI
├── popup.js              # 팝업 로직
├── options.html          # 옵션 페이지 UI
├── options.js            # 옵션 페이지 로직
├── icon16.svg            # 16x16 아이콘
├── icon48.svg            # 48x48 아이콘
└── icon128.svg           # 128x128 아이콘
```

### 기술 스택
- **Manifest 버전:** 3 (Chrome 확장 프로그램 v3)
- **권한:** `activeTab`, `contextMenus`, `notifications`, `storage`, `scripting`
- **호스트 권한:** 없음 (프로그램적 주입은 사용자 트리거와 `activeTab` 기반으로 동작)

### Transmission API
이 확장 프로그램은 Transmission의 RPC API를 사용하여 통신합니다:
- RPC 버전: 15+
- 기본 포트: 9091
- API 엔드포인트: `/transmission/rpc`

## 빌드 및 배포

### 빌드 및 배포

### 로컬 빌드 (GitHub Pages + Release 패키지)
```bash
npm run build
```

빌드 결과물:
- `dist/torrent-link-proxy-v<version>.zip` (릴리즈 업로드용)
- `dist/pages/` (GitHub Pages 아티팩트)

### 스크립트/수동 빌드

프로젝트에는 플랫폼별 스크립트 빌드와 수동 빌드 방식이 모두 제공됩니다.

#### 스크립트 빌드

**Windows:**
```powershell
# Python 스크립트 사용 (크로스 플랫폼)
python3 create-release.py

# 또는 PowerShell 스크립트
PowerShell -ExecutionPolicy Bypass -File create-release.ps1
```

**Linux/Mac:**
```bash
# Python 스크립트 사용 (크로스 플랫폼)
python3 create-release.py

# 또는 Bash 스크립트
bash create-release.sh
```

#### 수동 빌드

수동으로 ZIP 파일을 생성하려면:
```bash
zip -r torrent-link-proxy.zip manifest.json background.js content.js popup.html popup.js options.html options.js icon*.svg _locales/
```

### Chrome Web Store 배포

1. `manifest.json` 검증 (Chrome 확장 프로그램 매니페스트 유효성 검사)
2. 배포용 ZIP 파일 준비:
   - `npm run build` 결과: `dist/torrent-link-proxy-v<version>.zip`
   - 수동/스크립트 빌드 결과: `torrent-link-proxy.zip`
3. [Chrome Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)에서 업로드
4. 검토 및 게시

### GitHub Pages
프로젝트 웹사이트는 GitHub Pages에서 호스팅됩니다:
- URL: `https://[username].github.io/[repository-name]/`
- 자동 배포: `main` 브랜치 푸시 시 GitHub Actions 사용 (`dist/pages` 배포)

### GitHub Release
- 태그 푸시(`v*`) 시 GitHub Actions가 릴리즈 ZIP을 자동 생성/첨부합니다.

## 라이선스

MIT License

## 기여

기여를 환영합니다! 이슈나 풀 리퀘스트를 통해 개선사항을 제안해주세요.

## 버전 히스토리

### v1.0.3
- PNG 아이콘(`icon16.png`, `icon48.png`, `icon128.png`)을 manifest에서 사용해 Chrome 설치 시 SVG 디코딩 오류 예방
- `content.js`를 모든 사이트에 `run_at: document_start`로 다시 등록하고 `default_popup`을 명시해 popup 로직이 정해진 위치에서 실행되게 정리
- `scripts/generate_icon_pngs.py`를 추가해 128px PNG에서 48px/16px를 자동으로 만들 수 있도록 지원

### v1.0.4
- content script 주입 시 브라우저 내부(웹스토어/확장 갤러리 등)를 시도할 때 발생하던 예외 처리 개선:
  - `isInjectableUrl` 함수에서 비HTTP/HTTPS, `chrome://`, `chrome-extension://`, `edge://`, `about:`, `chrome.google.com/webstore` 등을 명시적으로 차단
  - 주입 실패 시 `chrome.runtime.lastError`와 에러 메시지 패턴을 확인해 웹스토어/내부 페이지 관련 오류는 경고로 처리하도록 변경
- 빌드 스크립트(build.sh / build.ps1)에서 PNG와 SVG를 모두 포함하도록 보완
- 패키지 버전 및 매니페스트 버전 업데이트 (v1.0.4)

### v1.0.1
- `activeTab` + `scripting` 기반 권한 축소
- `npm run build` 기반 패키징/배포 파이프라인 추가
- GitHub Pages/Release 워크플로우 정리

### v1.0.0
- 초기 릴리즈
- 마그넷 링크 우클릭 업로드
- 토렌트 파일 드래그 앤 드롭
- Transmission 서버 설정
- 기본 UI 구현
