# Transmission URL Supporter

Chrome 확장 프로그램으로 마그넷 링크와 토렌트 파일을 Transmission 비트토렌트 클라이언트에 쉽게 업로드할 수 있습니다.

## 주요 기능

- 🔗 마그넷 링크 우클릭으로 Transmission 서버에 직접 업로드
- 📁 토렌트 파일 드래그 앤 드롭 지원
- ⚙️ Transmission 서버 설정 저장
- 🔔 업로드 상태 알림
- 🎛️ 직관적인 옵션 페이지

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
2. Transmission 서버 정보 입력:
   - 서버 주소 (예: `http://localhost:9091`)
   - 사용자 이름 (선택사항)
   - 비밀번호 (선택사항)

### 마그넷 링크 업로드
1. 마그넷 링크 우클릭
2. "Transmission에 업로드" 선택

### 토렌트 파일 업로드
1. 토렌트 파일을 브라우저 창으로 드래그
2. 자동으로 Transmission에 업로드

## 개발 정보

### 파일 구조
```
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
- **권한:** contextMenus, storage, activeTab, notifications
- **호스트 권한:** 모든 URL

### Transmission API
이 확장 프로그램은 Transmission의 RPC API를 사용하여 통신합니다:
- RPC 버전: 15+
- 기본 포트: 9091
- API 엔드포인트: `/transmission/rpc`

## 빌드 및 배포

### Chrome Web Store 배포
1. `manifest.json` 검증
2. 배포용 ZIP 파일 생성:
   ```bash
   zip -r torrent-link-proxy-v1.0.0.zip manifest.json background.js content.js popup.html popup.js options.html options.js icon*.svg
   ```
3. [Chrome Developer Dashboard](https://chrome.google.com/webstore/developer/dashboard)에서 업로드
4. 검토 및 게시

### GitHub Pages
프로젝트 웹사이트는 GitHub Pages에서 호스팅됩니다:
- URL: `https://[username].github.io/[repository-name]/`
- 자동 배포: GitHub Actions 사용

## 라이선스

MIT License

## 기여

기여를 환영합니다! 이슈나 풀 리퀘스트를 통해 개선사항을 제안해주세요.

## 버전 히스토리

### v1.0.0
- 초기 릴리즈
- 마그넷 링크 우클릭 업로드
- 토렌트 파일 드래그 앤 드롭
- Transmission 서버 설정
- 기본 UI 구현