#!/bin/bash
# Chrome Web Store 배포용 .zip 파일 생성 스크립트 (Linux/Mac)
# 사용법: bash create-release.sh

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE_DIR="$PROJECT_DIR/release"
ZIP_PATH="$PROJECT_DIR/torrent-link-proxy.zip"

# 색상 정의
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# 기존 파일 정리
if [ -d "$RELEASE_DIR" ]; then
    rm -rf "$RELEASE_DIR"
fi

mkdir -p "$RELEASE_DIR"

# 필요한 파일들
FILES=(
    "manifest.json"
    "background.js"
    "content.js"
    "popup.html"
    "popup.js"
    "options.html"
    "options.js"
    "icon16.svg"
    "icon48.svg"
    "icon128.svg"
)

echo "필요한 파일들을 복사 중..."

for file in "${FILES[@]}"; do
    if [ -f "$PROJECT_DIR/$file" ]; then
        cp "$PROJECT_DIR/$file" "$RELEASE_DIR/"
        echo -e "  ${GREEN}✓${NC} $file"
    else
        echo -e "  ${RED}✗${NC} $file (파일 없음)"
    fi
done

# _locales 폴더 복사
if [ -d "$PROJECT_DIR/_locales" ]; then
    cp -r "$PROJECT_DIR/_locales" "$RELEASE_DIR/"
    echo -e "  ${GREEN}✓${NC} _locales 폴더"
fi

# 기존 zip 파일 삭제
if [ -f "$ZIP_PATH" ]; then
    rm "$ZIP_PATH"
fi

# .zip 파일 생성
echo -e "\n.zip 파일 생성 중..."
cd "$RELEASE_DIR"
zip -q -r "$ZIP_PATH" .
cd "$PROJECT_DIR"

if [ -f "$ZIP_PATH" ]; then
    # 파일 크기 계산 (크로스 플랫폼)
    if [[ "$OSTYPE" == "darwin"* ]]; then
        ZIP_SIZE=$(( $(stat -f%z "$ZIP_PATH") / 1024 ))
    else
        ZIP_SIZE=$(( $(stat -c%s "$ZIP_PATH") / 1024 ))
    fi
    echo -e "${GREEN}✓ $ZIP_PATH 생성 완료 (크기: ${ZIP_SIZE}KB)${NC}"
    echo -e "\n${GREEN}배포 준비 완료!${NC}"
    echo "파일: $ZIP_PATH"
    echo -e "\n다음 단계:"
    echo "1. https://chrome.google.com/webstore/devconsole 접속"
    echo "2. '새 항목' 클릭"
    echo "3. $ZIP_PATH 업로드"
else
    echo -e "${RED}✗ .zip 파일 생성 실패${NC}"
    exit 1
fi

# 임시 파일 정리
echo -e "\n임시 파일 정리 중..."
rm -rf "$RELEASE_DIR"
echo "완료!"