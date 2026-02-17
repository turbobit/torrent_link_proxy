// Content Script: 웹 페이지에서 실행되어 마우스 위치 정보 제공

let lastClickPosition = null;

// 우클릭 위치 기록
document.addEventListener('mousedown', (event) => {
  if (event.button === 2) { // 우클릭
    lastClickPosition = {
      x: event.clientX,
      y: event.clientY
    };
    console.log('[Torrent Proxy] Right-click position recorded:', lastClickPosition);
  }
}, true); // Capturing phase

// Background script에서 메시지 수신
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getWordAtCursor') {
    console.log('[Torrent Proxy] Getting word at cursor');

    if (!lastClickPosition) {
      console.error('[Torrent Proxy] No click position recorded');
      sendResponse({ word: null });
      return;
    }

    const word = getWordAtPosition(lastClickPosition.x, lastClickPosition.y);
    console.log('[Torrent Proxy] Extracted word:', word);
    sendResponse({ word: word });
  }
});

/**
 * 주어진 좌표(x, y)에서 단어를 추출
 * 마우스 위치 기준으로 좌우 공백까지 포함하여 단어 추출
 */
function getWordAtPosition(x, y) {
  let range = null;

  // Chromium 기반 브라우저: caretRangeFromPoint 사용
  if (document.caretRangeFromPoint) {
    try {
      range = document.caretRangeFromPoint(x, y);
    } catch (e) {
      console.error('[Torrent Proxy] caretRangeFromPoint error:', e);
      return null;
    }
  }

  // Firefox 등: elementFromPoint + 텍스트 처리
  if (!range) {
    const element = document.elementFromPoint(x, y);
    if (!element || !element.textContent) {
      return null;
    }
    // 요소의 첫 번째 텍스트 노드에서 모든 단어를 추출
    const words = element.textContent.trim().split(/\s+/);
    return words.length > 0 ? words[0] : null;
  }

  // Range가 유효한지 확인
  if (!range || !range.commonAncestorContainer) {
    console.error('[Torrent Proxy] Invalid range');
    return null;
  }

  const textNode = range.commonAncestorContainer;

  // 텍스트 노드가 아니면 null 반환
  if (textNode.nodeType !== Node.TEXT_NODE) {
    return null;
  }

  const text = textNode.textContent;
  const offset = range.startOffset;

  // offset 위치에서 좌우 공백을 기준으로 단어 추출
  // 좌측: 공백을 만날 때까지 왼쪽으로 이동
  let start = offset;
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }

  // 우측: 공백을 만날 때까지 오른쪽으로 이동
  let end = offset;
  while (end < text.length && !/\s/.test(text[end])) {
    end++;
  }

  const word = text.substring(start, end).trim();
  return word || null;
}

// 정규식 재사용 (전역 변수로 정의해서 매번 생성하지 않음)
const REGEX_PATTERNS = {
  magnet: /magnet:\?[^\s<>]+/gi,
  hexHash: /\b[a-fA-F0-9]{40}\b/g,
  base32Hash: /\b[a-zA-Z2-7]{32}\b/g
};

/**
 * 텍스트 노드에서 torrent 링크를 찾아 옆에 버튼 추가
 */
function processTextNodeForInlineButtons(textNode) {
  const text = textNode.nodeValue;
  if (!text || text.length < 32) return; // 너무 짧은 텍스트는 무시

  // 빠른 필터링: 키워드 포함 확인
  if (!text.includes('magnet') && !/[a-fA-F0-9]{40}/.test(text) && !/[a-zA-Z2-7]{32}/.test(text)) {
    return;
  }

  // 모든 매칭을 수집
  const matches = [];

  // magnet 링크 찾기
  REGEX_PATTERNS.magnet.lastIndex = 0;
  let match;
  while ((match = REGEX_PATTERNS.magnet.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], type: 'magnet' });
  }

  // 40자 hex 해시 찾기
  REGEX_PATTERNS.hexHash.lastIndex = 0;
  while ((match = REGEX_PATTERNS.hexHash.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], type: 'hash' });
  }

  // 32자 base32 해시 찾기
  REGEX_PATTERNS.base32Hash.lastIndex = 0;
  while ((match = REGEX_PATTERNS.base32Hash.exec(text)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, text: match[0], type: 'hash' });
  }

  if (matches.length === 0) return;

  // 오버래핑 매칭 제거 (정렬 후 겹치지 않는 것만 유지)
  matches.sort((a, b) => a.start - b.start);
  const filteredMatches = [];
  matches.forEach(m => {
    if (filteredMatches.length === 0 || m.start >= filteredMatches[filteredMatches.length - 1].end) {
      filteredMatches.push(m);
    }
  });

  // Fragment 생성해서 부분별로 추가
  const fragment = document.createDocumentFragment();

  filteredMatches.forEach(m => {
    // 이전 텍스트 추가
    if (m.start > lastIndex) {
      fragment.appendChild(document.createTextNode(text.substring(lastIndex, m.start)));
    }

    // 버튼 생성 (링크 왼쪽에 표시)
    const button = document.createElement('button');
    button.textContent = '⬆';
    button.className = 'torrent-upload-inline-btn';
    button.title = '업로드';
    button.style.cssText = 'margin-right: 4px; padding: 2px 6px; font-size: 12px; background-color: #4a90d9; color: white; border: none; border-radius: 3px; cursor: pointer; vertical-align: baseline; transition: background-color 0.2s;';
    button.type = 'button';

    // 버튼 클릭 핸들러
    button.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[Torrent Proxy] 🔘 인라인 버튼 클릭됨');
      console.log('[Torrent Proxy] 📦 대상:', m.text);
      console.log('[Torrent Proxy] 🔗 타입:', m.type);

      // 버튼 disabled 상태로 변경해서 중복 클릭 방지
      const originalText = button.textContent;
      button.disabled = true;
      button.textContent = '⟳';
      button.style.backgroundColor = '#666';

      chrome.runtime.sendMessage({
        action: 'uploadFromInline',
        torrent: m.text,
        type: m.type
      }, (response) => {
        console.log('[Torrent Proxy] ✅ 응답 받음:', response);

        // 버튼 상태 복원
        setTimeout(() => {
          button.disabled = false;
          button.textContent = originalText;
          button.style.backgroundColor = '#4a90d9';
        }, 2000);
      });
    };

    // 호버 효과
    button.onmouseover = () => {
      if (!button.disabled) button.style.backgroundColor = '#357abd';
    };
    button.onmouseout = () => {
      if (!button.disabled) button.style.backgroundColor = '#4a90d9';
    };

    fragment.appendChild(button);

    // 매칭된 텍스트를 span으로 감싸기
    const span = document.createElement('span');
    span.textContent = m.text;
    fragment.appendChild(span);

    lastIndex = m.end;
  });

  // 남은 텍스트 추가
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
  }

  // 텍스트 노드를 fragment로 교체
  textNode.parentNode.replaceChild(fragment, textNode);
}

/**
 * 페이지의 모든 텍스트 노드에 인라인 버튼 추가
 */
function initializeInlineButtons() {
  // 설정에서 inlineButton이 비활성화되어있으면 반환
  chrome.storage.sync.get('inlineButton', (data) => {
    if (data.inlineButton === false) {
      console.log('[Torrent Proxy] Inline buttons disabled in settings');
      return;
    }

    console.log('[Torrent Proxy] Initializing inline buttons');
    const processedNodes = new WeakSet(); // 처리된 노드 추적

    // 텍스트 노드 처리 (성능 최적화: 주요 요소만 처리)
    function processVisibleNodes() {
      const elements = document.querySelectorAll('p, div, span, li, td, h1, h2, h3, h4, h5, h6, a, article, section');
      let processedCount = 0;

      elements.forEach(el => {
        if (processedNodes.has(el)) return;
        processedNodes.add(el);

        const walker = document.createTreeWalker(
          el,
          NodeFilter.SHOW_TEXT,
          null,
          false
        );

        let textNode;
        while (textNode = walker.nextNode()) {
          if (!processedNodes.has(textNode)) {
            processedNodes.add(textNode);
            processTextNodeForInlineButtons(textNode);
            processedCount++;
          }
        }
      });

      console.log(`[Torrent Proxy] ✅ ${processedCount}개 노드 처리 완료`);
    }

    // 초기 처리를 requestAnimationFrame으로 분산
    requestAnimationFrame(() => {
      console.log('[Torrent Proxy] 🔄 초기 노드 처리 시작');
      processVisibleNodes();

      // 동적으로 추가되는 요소 모니터링
      let mutationTimeout;
      const observer = new MutationObserver((mutations) => {
        // debounce: 200ms 동안 변화를 모아서 처리
        clearTimeout(mutationTimeout);
        mutationTimeout = setTimeout(() => {
          let newNodesCount = 0;
          mutations.forEach((mutation) => {
            if (mutation.type === 'childList') {
              mutation.addedNodes.forEach((node) => {
                if (processedNodes.has(node)) return;

                if (node.nodeType === Node.TEXT_NODE) {
                  processedNodes.add(node);
                  processTextNodeForInlineButtons(node);
                  newNodesCount++;
                } else if (node.nodeType === Node.ELEMENT_NODE) {
                  // 버튼 요소는 무시
                  if (node.className === 'torrent-upload-inline-btn') return;

                  processedNodes.add(node);
                  const walker = document.createTreeWalker(
                    node,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                  );
                  let textNode;
                  while (textNode = walker.nextNode()) {
                    if (!processedNodes.has(textNode)) {
                      processedNodes.add(textNode);
                      processTextNodeForInlineButtons(textNode);
                      newNodesCount++;
                    }
                  }
                }
              });
            }
          });

          if (newNodesCount > 0) {
            console.log(`[Torrent Proxy] 📍 ${newNodesCount}개 새로운 노드 처리됨`);
          }
        }, 200);
      });

      // 제한된 범위만 모니터링 (성능 최적화)
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      console.log('[Torrent Proxy] ✅ MutationObserver 활성화됨');
    });
  });
}

// 페이지 로드 시 인라인 버튼 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeInlineButtons);
} else {
  initializeInlineButtons();
}
