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

  // 부모가 이미 처리되었는지 확인 (중복 처리 방지)
  const parent = textNode.parentNode;
  if (parent?.dataset?.torrentButtonsProcessed === 'true') {
    return;
  }

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
  let lastIndex = 0; // 텍스트 위치 추적

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

      // Service Worker 깨우기 함수
      const wakeServiceWorker = () => {
        return new Promise((resolve) => {
          try {
            // 간단한 ping 메시지로 Service Worker 깨우기
            chrome.runtime.sendMessage({ action: 'ping' }, (response) => {
              if (chrome.runtime.lastError) {
                console.log('[Torrent Proxy] 🔄 Service Worker 깨우는 중...');
                resolve(false);
              } else {
                console.log('[Torrent Proxy] ✅ Service Worker 응답 받음');
                resolve(true);
              }
            });
          } catch (e) {
            console.log('[Torrent Proxy] 🔄 Service Worker 깨우기 시도 중...');
            resolve(false);
          }

          // 타임아웃 설정 (Service Worker가 응답하지 않아도 계속 진행)
          setTimeout(() => resolve(false), 200);
        });
      };

      // 메시지 전송 함수 (재시도 로직 포함)
      const sendMessageWithRetry = async (retryCount = 0) => {
        try {
          chrome.runtime.sendMessage({
            action: 'uploadFromInline',
            torrent: m.text,
            type: m.type
          }, (response) => {
            // Service Worker 컨텍스트 에러 처리
            if (chrome.runtime.lastError) {
              const errorMessage = chrome.runtime.lastError.message;
              console.error('[Torrent Proxy] ❌ 런타임 에러:', errorMessage);

              // Extension context invalidated 에러인 경우 재시도
              if (errorMessage.includes('Extension context invalidated') && retryCount < 2) {
                console.log('[Torrent Proxy] 🔄 Service Worker 재시작 대기 후 재시도...');
                button.textContent = '⟲';

                setTimeout(() => {
                  sendMessageWithRetry(retryCount + 1);
                }, 1000); // 1초 대기 후 재시도
                return;
              }

              // 다른 에러들은 실패로 처리
              button.disabled = false;
              button.textContent = '❌';
              button.style.backgroundColor = '#dc3545';
              button.title = '업로드 실패: ' + errorMessage;
              return;
            }

            // 성공 응답 처리
            console.log('[Torrent Proxy] ✅ 응답 받음:', response);

            if (response && response.success) {
              button.textContent = '✅';
              button.style.backgroundColor = '#28a745';
              button.title = '업로드 성공';
            } else {
              button.textContent = '❌';
              button.style.backgroundColor = '#dc3545';
              button.title = response?.error || '업로드 실패';
            }

            // 버튼 상태 복원
            setTimeout(() => {
              button.disabled = false;
              button.textContent = originalText;
              button.style.backgroundColor = '#4a90d9';
              button.title = '업로드';
            }, 3000);
          });
        } catch (error) {
          console.error('[Torrent Proxy] ❌ 메시지 전송 예외:', error.message);
          button.disabled = false;
          button.textContent = '❌';
          button.style.backgroundColor = '#dc3545';
          button.title = '업로드 실패: ' + error.message;
        }
      };

      // 메시지 전송 시작 (Service Worker 깨우기 후)
      wakeServiceWorker().then(() => {
        sendMessageWithRetry();
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
    span.dataset.torrentMatched = 'true';
    fragment.appendChild(span);

    lastIndex = m.end;
  });

  // 남은 텍스트 추가
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
  }

  // 텍스트 노드를 fragment로 교체
  parent.replaceChild(fragment, textNode);

  // 부모 요소에 처리 완료 표시 (중복 처리 방지)
  parent.dataset.torrentButtonsProcessed = 'true';
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
      const allElements = Array.from(document.querySelectorAll('p, div, span, li, td, h1, h2, h3, h4, h5, h6, a, article, section'));

      // Nested elements 제거: 부모가 이미 선택된 element는 제외 (중복 처리 방지)
      const rootElements = allElements.filter(el => {
        let parent = el.parentElement;
        while (parent) {
          if (allElements.includes(parent)) {
            return false; // 부모가 선택됨 → 제외
          }
          parent = parent.parentElement;
        }
        return true; // 부모가 없음 → 포함
      });

      let processedCount = 0;

      rootElements.forEach(el => {
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
                  // 버튼 요소 또는 이미 처리된 부모는 무시
                  if (node.className === 'torrent-upload-inline-btn') return;
                  if (node.dataset?.torrentMatched === 'true') return;
                  if (node.dataset?.torrentButtonsProcessed === 'true') return;

                  processedNodes.add(node);
                  const walker = document.createTreeWalker(
                    node,
                    NodeFilter.SHOW_TEXT,
                    null,
                    false
                  );
                  let textNode;
                  while (textNode = walker.nextNode()) {
                    // Ancestor 중 이미 처리된 element가 있는지 확인
                    let isProcessed = false;
                    let parent = textNode.parentNode;
                    while (parent) {
                      if (parent.dataset?.torrentButtonsProcessed === 'true') {
                        isProcessed = true;
                        break;
                      }
                      parent = parent.parentNode;
                    }
                    if (isProcessed) {
                      continue;
                    }

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

      // Cleanup 함수 설정 (페이지 언로드 시 정리용)
      const cleanup = () => {
        console.log('[Torrent Proxy] 🧹 정리 중...');
        observer.disconnect();
        clearTimeout(mutationTimeout);
      };

      // 전역 변수에 저장해서 cleanup 가능하도록
      window.torrentProxyCleanup = cleanup;
    });
  });
}

// 페이지 로드 시 인라인 버튼 초기화
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeInlineButtons);
} else {
  initializeInlineButtons();
}

// 페이지 언로드 시 정리
window.addEventListener('beforeunload', () => {
  if (window.torrentProxyCleanup) {
    window.torrentProxyCleanup();
  }
});
