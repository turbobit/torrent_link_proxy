// 디버그 로그 활성화 여부 (개발 중에는 true, 배포 시 false)
const DEBUG_LOGS = true;

// 디버그 로그 함수
function debugLog(tag, message, data = null) {
  if (!DEBUG_LOGS) return;
  if (data) {
    console.log(`${tag} ${message}`, data);
  } else {
    console.log(`${tag} ${message}`);
  }
}

// Transmission 서버 설정 저장 키
const SETTINGS_KEY = 'transmissionSettings';

// 기본 설정
const defaultSettings = {
  serverUrl: '',
  username: '',
  password: ''
};

// 전역 세션 ID (CSRF 보호용)
let globalSessionId = null;

// 설정 캐시 (성능 최적화)
let settingsCache = null;
let settingsCacheTime = 0;
const SETTINGS_CACHE_TTL = 30000; // 30초 캐시

// 설정 로드 (캐싱 포함)
function getSettings() {
  return new Promise((resolve) => {
    const now = Date.now();

    // 캐시가 유효하면 캐시된 설정 반환
    if (settingsCache && (now - settingsCacheTime) < SETTINGS_CACHE_TTL) {
      resolve(settingsCache);
      return;
    }

    chrome.storage.sync.get(SETTINGS_KEY, (data) => {
      const settings = data[SETTINGS_KEY] || defaultSettings;
      settingsCache = settings;
      settingsCacheTime = now;
      resolve(settings);
    });
  });
}

// 설정 저장 (캐시 업데이트 포함)
function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => {
      // 캐시 업데이트
      settingsCache = settings;
      settingsCacheTime = Date.now();
      resolve();
    });
  });
}

// RPC 요청 유틸리티 (타임아웃: 10초)
const RPC_TIMEOUT = 10000;

function transmissionRpc(serverUrl, method, params = null, username = null, password = null) {
  return new Promise((resolve, reject) => {
    const rpcUrl = serverUrl.endsWith('/') ? `${serverUrl}rpc` : `${serverUrl}/rpc`;
    debugLog('[RPC]', `📤 요청: ${method}`);
    debugLog('[RPC]', `🌐 URL: ${rpcUrl}`);

    // Transmission RPC 표준 형식: method와 arguments
    const request = {
      method: method
    };

    if (params) {
      request.arguments = params;
      debugLog('[RPC]', `📋 매개변수:`, params);
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    // Basic Auth 헤더 추가
    if (username || password) {
      const base64Credentials = btoa(`${username}:${password}`);
      headers['Authorization'] = `Basic ${base64Credentials}`;
      debugLog('[RPC]', `🔑 인증 헤더 추가됨`);
    }

    // 세션 ID가 있으면 추가 (CSRF 보호)
    if (globalSessionId) {
      headers['X-Transmission-Session-Id'] = globalSessionId;
      debugLog('[RPC]', `🔐 세션 ID: ${globalSessionId}`);
    }

    // 타임아웃 Promise
    const timeoutPromise = new Promise((_, timeoutReject) => {
      setTimeout(() => timeoutReject(new Error('RPC request timeout')), RPC_TIMEOUT);
    });

    // fetch와 타임아웃 중 먼저 완료되는 것 사용
    Promise.race([
      fetch(rpcUrl, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(request)
      }),
      timeoutPromise
    ])
    .then(response => {
      console.log(`[Transmission RPC] 📥 응답 상태: ${response.status}`);

      // 409 Conflict는 세션 ID가 유효하지 않을 때 발생 -> 갱신 후 재시도
      if (response.status === 409) {
        console.log(`[Transmission RPC] ⚠️ 세션 ID 갱신 필요`);
        globalSessionId = response.headers.get('X-Transmission-Session-Id');
        console.log(`[Transmission RPC] ✅ 새 세션 ID: ${globalSessionId}`);
        const retryHeaders = {
          'Content-Type': 'application/json',
          'X-Transmission-Session-Id': globalSessionId
        };
        // 인증 정보도 함께 전달
        if (username || password) {
          const base64Credentials = btoa(`${username}:${password}`);
          retryHeaders['Authorization'] = `Basic ${base64Credentials}`;
        }
        return fetch(rpcUrl, {
          method: 'POST',
          headers: retryHeaders,
          body: JSON.stringify(request)
        });
      }
      return response;
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          console.error(`[Transmission RPC] ❌ HTTP 오류:`, text);
          throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        console.error(`[Transmission RPC] ❌ RPC 오류:`, data.error);
        throw new Error(data.error);
      }
      // Transmission RPC는 arguments와 result를 모두 반환
      // arguments에 실제 응답 데이터가 포함됨
      const result = data.arguments || data.result;
      console.log(`[Transmission RPC] ✅ 성공:`, result);
      resolve(result);
    })
    .catch(error => {
      console.error(`[Transmission RPC] ❌ 오류:`, error.message);
      reject(error);
    });
  });
}

// Transmission 서버 연결 테스트
async function testConnection(serverUrl, username = null, password = null) {
  try {
    globalSessionId = null; // 세션 ID 초기화
    const result = await transmissionRpc(serverUrl, 'session-get', null, username, password);
    return { success: true, version: result?.version };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// Magnet 링크에서 info hash 추출
function extractInfoHash(magnetLink) {
  // magnet:?xt=urn:btih:XXXXX 형식에서 XXXXX 추출
  const match = magnetLink.match(/btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i);
  if (match) {
    return match[1].toUpperCase();
  }
  return null;
}

// 파싱용 정규식 (재사용을 위해 미리 컴파일)
const PARSE_PATTERNS = {
  hexHash: /^[a-fA-F0-9]{40}$/,
  base32Hash: /^[a-zA-Z2-7]{32}$/,
  btih: /btih:([a-fA-F0-9]{40}|[a-zA-Z2-7]{32})/i
};

// 텍스트에서 토렌트 정보 파싱 (magnet link, info hash, torrent 파일 링크)
function parseTorrentFromText(text) {
  const trimmedText = text.trim();

  // 1. Magnet 링크 확인
  if (trimmedText.startsWith('magnet:')) {
    const infoHash = extractInfoHash(trimmedText);
    if (infoHash) {
      return {
        type: 'magnet',
        magnetLink: trimmedText,
        infoHash: infoHash
      };
    }
  }

  // 2. 40자 16진수 정보 해시 확인 (대소문자 구분 없음)
  if (PARSE_PATTERNS.hexHash.test(trimmedText)) {
    return {
      type: 'hash',
      infoHash: trimmedText.toUpperCase(),
      magnetLink: `magnet:?xt=urn:btih:${trimmedText.toUpperCase()}`
    };
  }

  // 3. 32자 Base32 해시 확인
  if (PARSE_PATTERNS.base32Hash.test(trimmedText)) {
    return {
      type: 'hash',
      infoHash: trimmedText.toUpperCase(),
      magnetLink: `magnet:?xt=urn:btih:${trimmedText.toUpperCase()}`
    };
  }

  // 4. torrent 파일 링크 확인 (http/https로 시작하고 .torrent로 끝남)
  if (trimmedText.startsWith('http://') || trimmedText.startsWith('https://')) {
    if (trimmedText.toLowerCase().endsWith('.torrent')) {
      return {
        type: 'torrent_file',
        url: trimmedText
      };
    }
  }

  // 파싱 실패
  return null;
}

// serverUrl에서 RPC URL 생성
function getRpcUrl(serverUrl) {
  let rpcUrl = serverUrl;

  // 이미 /rpc가 있으면 그대로 반환
  if (rpcUrl.includes('/rpc')) {
    return rpcUrl;
  }

  // 끝에 /rpc 추가
  if (!rpcUrl.endsWith('/')) {
    rpcUrl += '/';
  }
  rpcUrl += 'rpc';

  return rpcUrl;
}

// serverUrl에서 Web UI URL 생성
function createWebUrl(serverUrl) {
  let webUrl = serverUrl;

  // 이미 /web/#upload가 있으면 그대로 반환
  if (webUrl.includes('/web/#upload')) {
    return webUrl;
  }

  // 끝에 /web/#upload 추가
  if (!webUrl.endsWith('/')) {
    webUrl += '/';
  }
  webUrl += 'web/#upload';

  return webUrl;
}

// 컨텍스트 메뉴 생성
function createContextMenus() {
  // 기존 메뉴 제거
  chrome.contextMenus.removeAll();

  // 링크에 대한 메뉴 ( magnet 링크 포함 )
  chrome.contextMenus.create({
    id: 'upload Torrent',
    title: chrome.i18n.getMessage('contextMenuUpload'),
    contexts: ['link'],
    targetUrlPatterns: [
      'magnet:*',
      '*://*/*.torrent'
    ]
  });

  // 텍스트 선택 시 또는 페이지 우클릭 시 ( info hash 직접 입력 가능 )
  chrome.contextMenus.create({
    id: 'upload With Hash',
    title: chrome.i18n.getMessage('contextMenuUploadHash'),
    contexts: ['selection', 'page']
  });
}

// 시스템 알림 표시
function showNotification(title, message) {
  try {
    // title과 message가 유효한지 확인
    if (!title || !message) {
      console.warn('[Notification] ⚠️ 알림 제목 또는 메시지가 비어있음:', { title, message });
      return;
    }

    chrome.notifications.create('torrent-' + Date.now(), {
      type: 'basic',
      title: title,
      message: message
    }, (notificationId) => {
      // 알림 생성 완료
      if (chrome.runtime.lastError) {
        console.error('[Notification] ❌ 알림 생성 실패:', chrome.runtime.lastError.message);
      } else {
        console.log('[Notification] ✅ 알림 생성 성공:', notificationId);
      }
    });
  } catch (error) {
    console.error('[Notification] ❌ 알림 생성 예외:', error.message);
  }
}

// 사용자 설정에 따라 결과 표시 (badge, notification, console)
async function showResultNotification(status, message, options = {}) {
  const settings = await getSettings();
  const notificationStyles = settings.notificationStyles || ['badge', 'notification'];
  const isError = status === 'error';
  const isDuplicate = status === 'duplicate';
  const isProcessing = status === 'processing';

  // Badge 표시 (설정에서 활성화된 경우)
  if (notificationStyles.includes('badge')) {
    let badgeText = '✓';
    let badgeColor = '#00aa00';

    if (isError) {
      badgeText = '!';
      badgeColor = '#ff0000';
    } else if (isDuplicate) {
      badgeText = '⚠';
      badgeColor = '#FFA500';
    } else if (isProcessing) {
      badgeText = '⊙';
      badgeColor = '#4a90d9';
    }

    chrome.action.setBadgeText({ text: badgeText });
    chrome.action.setBadgeBackgroundColor({ color: badgeColor });

    // Processing 상태는 자동 지우지 않음 (결과 상태로 업데이트됨)
    if (!isProcessing) {
      setTimeout(() => {
        chrome.action.setBadgeText({ text: '' });
      }, 2000);
    }
  }

  // 시스템 알림 표시 (설정에서 활성화된 경우)
  if (notificationStyles.includes('notification')) {
    let title = 'Transmission';
    if (isError) {
      title = 'Transmission - 오류';
    } else if (isProcessing) {
      title = 'Transmission - 처리 중';
    }
    showNotification(title, message);
  }

  // 콘솔 로그 출력 (설정에서 활성화된 경우)
  if (notificationStyles.includes('console')) {
    const logLevel = isError ? 'error' : 'log';
    console[logLevel](`[Transmission Result - ${status}]:`, message, options);
  }
}

// Magnet link 또는 torrent file을 Transmission에 추가
async function addTorrentToTransmission(serverUrl, torrentInfo, username = null, password = null) {
  globalSessionId = null; // 세션 ID 초기화
  console.log(`\n[Transmission Add] 🚀 토렌트 추가 시작`);
  console.log(`[Transmission Add] 📍 서버: ${serverUrl}`);
  console.log(`[Transmission Add] 📦 타입: ${torrentInfo.type}`);
  console.log(`[Transmission Add] 🔗 정보: ${torrentInfo.magnetLink || torrentInfo.infoHash || torrentInfo.url}`);

  try {
    let result;

    if (torrentInfo.type === 'magnet' || torrentInfo.type === 'hash') {
      // Magnet link 추가
      console.log(`[Transmission Add] 📤 RPC 요청 중...`);
      result = await transmissionRpc(serverUrl, 'torrent-add', {
        filename: torrentInfo.magnetLink
      }, username, password);
      console.log(`[Transmission Add] 📥 RPC 응답 완료`);
    } else if (torrentInfo.type === 'torrent_file') {
      // torrent 파일은 Web UI를 통해 업로드 필요 (RPC는 base64 metainfo 필요)
      // Web UI의 #upload 섹션으로 리디렉션
      console.log(`[Transmission Add] 🌐 웹 UI로 리디렉션`);
      const webUrl = createWebUrl(serverUrl);
      const uploadUrl = `${webUrl}?magnet=${encodeURIComponent(torrentInfo.url)}`;
      chrome.tabs.create({ url: uploadUrl });
      return { success: true, redirect: true };
    }

    if (result) {
      // torrent-added (새로 추가됨) 또는 torrent-duplicate (이미 있음) 확인
      const isAdded = result?.['torrent-added'];
      const isDuplicate = result?.['torrent-duplicate'];

      let torrentId, hashString, type;

      if (isAdded) {
        torrentId = isAdded.id;
        hashString = isAdded.hashString;
        type = 'added';
        console.log(`[Transmission Add] ✅ 새 토렌트 추가됨`);
        console.log(`[Transmission Add] 📌 ID: ${torrentId}`);
        console.log(`[Transmission Add] 🔐 Hash: ${hashString}`);
      } else if (isDuplicate) {
        torrentId = isDuplicate.id;
        hashString = isDuplicate.hashString;
        type = 'duplicate';
        console.log(`[Transmission Add] ⚠️ 중복 토렌트 (이미 존재)`);
        console.log(`[Transmission Add] 📌 ID: ${torrentId}`);
        console.log(`[Transmission Add] 🔐 Hash: ${hashString}`);
      } else {
        console.warn(`[Transmission Add] ⚠️ 알 수 없는 응답:`, result);
      }

      return {
        success: true,
        type: type,
        torrentId: torrentId,
        hashString: hashString
      };
    }

    console.error(`[Transmission Add] ❌ 응답이 없습니다`);
    return { success: false, error: 'Unknown error' };
  } catch (error) {
    console.error(`[Transmission Add] ❌ 오류 발생:`, error.message);
    return { success: false, error: error.message };
  }
}

// URL이 allowedUrls와 일치하는지 확인
function isUrlAllowed(tabUrl, allowedUrls) {
  // allowedUrls가 비어있으면 모든 URL 허용
  if (!allowedUrls || allowedUrls.length === 0) {
    return true;
  }

  try {
    const url = new URL(tabUrl);
    const currentDomain = url.hostname;

    // allowedUrls의 각 항목과 비교 (도메인 매칭)
    return allowedUrls.some(allowedUrl => {
      // allowedUrl이 도메인만인 경우와 전체 URL인 경우 모두 처리
      let allowedDomain = allowedUrl.trim();

      // http:// 또는 https://를 제거
      if (allowedDomain.startsWith('http://')) {
        allowedDomain = allowedDomain.substring(7);
      } else if (allowedDomain.startsWith('https://')) {
        allowedDomain = allowedDomain.substring(8);
      }

      // 끝의 / 제거
      allowedDomain = allowedDomain.replace(/\/$/, '');

      // 도메인 또는 서브도메인 매칭
      return currentDomain === allowedDomain || currentDomain.endsWith('.' + allowedDomain);
    });
  } catch (error) {
    console.error('URL parsing error:', error);
    return false;
  }
}

const ALLOWED_ORIGINS_KEY = 'activeTabAllowedOrigins';

function isInjectableUrl(url) {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

function getOriginFromUrl(url) {
  if (!isInjectableUrl(url)) return null;
  try {
    return new URL(url).origin;
  } catch (error) {
    console.error('Invalid tab URL:', url, error);
    return null;
  }
}

function getAllowedOrigins() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(ALLOWED_ORIGINS_KEY, (data) => {
      const origins = data[ALLOWED_ORIGINS_KEY];
      resolve(Array.isArray(origins) ? origins : []);
    });
  });
}

function saveAllowedOrigins(origins) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [ALLOWED_ORIGINS_KEY]: origins }, resolve);
  });
}

async function rememberAllowedOrigin(origin) {
  const origins = await getAllowedOrigins();
  if (!origins.includes(origin)) {
    origins.push(origin);
    await saveAllowedOrigins(origins);
  }
}

async function updateBadgeForTab(tabId, tabUrl) {
  const origin = getOriginFromUrl(tabUrl);
  if (!origin) {
    chrome.action.setBadgeText({ tabId, text: '' });
    return;
  }

  const origins = await getAllowedOrigins();
  const isAllowed = origins.includes(origin);

  chrome.action.setBadgeText({ tabId, text: isAllowed ? 'ON' : '' });
  if (isAllowed) {
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#2f855a' });
  }
}

async function ensureContentScriptInjected(tabId) {
  if (!tabId) return false;

  try {
    const probeResults = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => Boolean(window.__torrentProxyContentScriptInjected)
    });
    const alreadyInjected = Array.isArray(probeResults) && probeResults[0]?.result === true;

    if (!alreadyInjected) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['content.js']
      });
      return true;
    }

    return false;
  } catch (error) {
    console.error('Failed to inject content script:', error);
    return false;
  }
}

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab?.id || !isInjectableUrl(tab.url)) {
    return;
  }

  const origin = getOriginFromUrl(tab.url);
  if (!origin) return;

  await rememberAllowedOrigin(origin);
  await ensureContentScriptInjected(tab.id);
  await updateBadgeForTab(tab.id, tab.url);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' && !changeInfo.url) {
    return;
  }

  updateBadgeForTab(tabId, tab?.url || changeInfo.url);
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      return;
    }
    updateBadgeForTab(tabId, tab.url);
  });
});

// 컨텍스트 메뉴 클릭 핸들러
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (!tab?.id || !tab.url) {
    return;
  }

  const settings = await getSettings();

  // URL allowlist 확인
  if (!isUrlAllowed(tab.url, settings.allowedUrls)) {
    console.log('URL not allowed:', tab.url, 'allowedUrls:', settings.allowedUrls);
    showResultNotification('error', chrome.i18n.getMessage('notificationExtensionDisabled'));
    return;
  }

  switch (info.menuItemId) {
    case 'upload Torrent':
      // 링크가 magnet 링크인 경우
      if (info.linkUrl.startsWith('magnet:')) {
        const torrentInfo = parseTorrentFromText(info.linkUrl);
        if (torrentInfo) {
          console.log('Uploading magnet link:', torrentInfo);
          const result = await addTorrentToTransmission(settings.serverUrl, torrentInfo, settings.username, settings.password);
          if (result.redirect) {
            // Web UI로 리디렉션됨
            console.log('Redirected to Web UI for magnet link');
          } else if (result.success) {
            // 성공 알림 (새로 추가됨 또는 중복)
            const message = result.type === 'added'
              ? chrome.i18n.getMessage('notificationTorrentAdded')
              : chrome.i18n.getMessage('notificationTorrentExists');
            console.log(`Success (${result.type}): Magnet link`, {
              message: message,
              torrentId: result.torrentId,
              hashString: result.hashString
            });
            showResultNotification(result.type, message, {
              torrentId: result.torrentId,
              hashString: result.hashString
            });
          } else {
            // 실패 알림
            console.error('Failed to add magnet link:', result.error);
            const errorMsg = `오류: ${result.error}`;
            showResultNotification('error', errorMsg);
          }
        } else {
          console.error('Failed to parse magnet link:', info.linkUrl);
        }
      }
      // torrent 파일 링크인 경우
      else if (info.linkUrl.toLowerCase().endsWith('.torrent')) {
        const torrentInfo = {
          type: 'torrent_file',
          url: info.linkUrl
        };
        console.log('Uploading torrent file:', torrentInfo);
        const result = await addTorrentToTransmission(settings.serverUrl, torrentInfo, settings.username, settings.password);
        if (result.redirect) {
          console.log('Redirected to Web UI for torrent file');
        } else {
          console.log('Torrent file handling completed');
          chrome.tabs.create({ url: info.linkUrl });
        }
      }
      break;

    case 'upload With Hash':
      // 선택한 텍스트가 있는지 확인
      const selectedText = info.selectionText?.trim();

      if (selectedText) {
        // ===== 선택 영역이 있는 경우: 공백으로 분리 =====
        const tokens = selectedText.split(/\s+/); // 공백으로 분리
        console.log('Selected text tokens:', tokens);

        let torrentInfo = null;
        let foundTokenIndex = -1;

        // 각 토큰을 순회하며 첫 번째 유효한 토렌트 정보 찾기
        for (let i = 0; i < tokens.length; i++) {
          const parsed = parseTorrentFromText(tokens[i]);
          if (parsed && (parsed.type === 'magnet' || parsed.type === 'hash')) {
            torrentInfo = parsed;
            foundTokenIndex = i;
            break;
          }
        }

        if (torrentInfo) {
          console.log('Found valid torrent info at token index', foundTokenIndex, ':', torrentInfo);
          const result = await addTorrentToTransmission(settings.serverUrl, torrentInfo, settings.username, settings.password);
          if (result.redirect) {
            // Web UI로 리디렉션됨
            console.log('Redirected to Web UI for hash');
          } else if (result.success) {
            // 성공 알림 (새로 추가됨 또는 중복)
            const message = result.type === 'added'
              ? chrome.i18n.getMessage('notificationTorrentAdded')
              : chrome.i18n.getMessage('notificationTorrentExists');
            console.log(`Success (${result.type}): Hash/Magnet added to Transmission`, {
              message: message,
              torrentId: result.torrentId,
              hashString: result.hashString,
              token: tokens[foundTokenIndex]
            });
            showResultNotification(result.type, message, {
              torrentId: result.torrentId,
              hashString: result.hashString,
              token: tokens[foundTokenIndex]
            });
          } else {
            // 실패 알림
            console.error('Failed to add hash/magnet:', {
              error: result.error,
              token: tokens[foundTokenIndex]
            });
            const errorMsg = `오류: ${result.error}`;
            showResultNotification('error', errorMsg);
          }
        } else {
          // 유효하지 않은 형식
          console.error('No valid torrent information found in selection', {
            selectedText: selectedText,
            tokens: tokens
          });
          showResultNotification('error', chrome.i18n.getMessage('notificationNoTorrentFound'));
        }
      } else {
        // ===== 선택 영역이 없는 경우: Content Script에서 클릭 위치의 단어 추출 =====
        await ensureContentScriptInjected(tab.id);
        console.log('No selection. Requesting word at cursor from content script');
        chrome.tabs.sendMessage(tab.id, { action: 'getWordAtCursor' }, (response) => {
          if (chrome.runtime.lastError) {
            console.error('Content script error:', chrome.runtime.lastError);
            showResultNotification('error', chrome.i18n.getMessage('notificationContentScriptError'));
            return;
          }

          const word = response?.word?.trim();
          console.log('Word at cursor:', word);

          if (!word) {
            console.error('No word found at cursor position');
            showResultNotification('error', chrome.i18n.getMessage('notificationNoTextAtCursor'));
            return;
          }

          // 추출된 단어를 파싱
          const torrentInfo = parseTorrentFromText(word);
          console.log('Parsed torrent info from word:', torrentInfo);

          if (torrentInfo && (torrentInfo.type === 'magnet' || torrentInfo.type === 'hash')) {
            addTorrentToTransmission(settings.serverUrl, torrentInfo, settings.username, settings.password).then((result) => {
              if (result.redirect) {
                console.log('Redirected to Web UI for hash');
              } else if (result.success) {
                const message = result.type === 'added'
                  ? '새로운 토렌트 추가됨'
                  : '이미 올라간 토렌트입니다';
                console.log(`Success (${result.type}): Hash/Magnet added to Transmission`, {
                  message: message,
                  torrentId: result.torrentId,
                  hashString: result.hashString,
                  word: word
                });
                showResultNotification(result.type, message, {
                  torrentId: result.torrentId,
                  hashString: result.hashString,
                  word: word
                });
              } else {
                console.error('Failed to add hash/magnet:', {
                  error: result.error,
                  word: word
                });
                const errorMsg = `오류: ${result.error}`;
                showResultNotification('error', errorMsg);
              }
            });
          } else {
            console.error('Invalid torrent information', {
              word: word,
              torrentInfo: torrentInfo
            });
            showResultNotification('error', chrome.i18n.getMessage('notificationNoTorrentFound'));
          }
        });
      }
      break;
  }
});

// 확장 프로그램 설치/업데이트 시 초기화
chrome.runtime.onInstalled.addListener(() => {
  // 기본 설정 저장 (존재하지 않으면)
  chrome.storage.sync.get(SETTINGS_KEY, (data) => {
    if (!data[SETTINGS_KEY]) {
      chrome.storage.sync.set({ [SETTINGS_KEY]: defaultSettings });
    }
  });
  createContextMenus();
});

// 설정 업데이트 시 메뉴 재생성
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace === 'sync' && changes[SETTINGS_KEY]) {
    createContextMenus();
  }
});

// 팝업에서 설정 업데이트 요청이 오면 메뉴 재생성
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'ping') {
    // Service Worker 깨우기용 ping 응답
    sendResponse({ status: 'pong' });
    return;
  }

  if (request.action === 'updateMenu') {
    createContextMenus();
    sendResponse({ status: 'ok' });
  }
});

// RPC 요청 전역 핸들러 (팝업에서 사용)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'testConnection') {
    testConnection(request.serverUrl).then(result => {
      sendResponse(result);
    });
    return true; // 비동기 응답
  }

  if (request.action === 'addTorrent') {
    addTorrentToTransmission(request.serverUrl, request.torrentInfo).then(result => {
      sendResponse(result);
    });
    return true; // 비동기 응답
  }

  // Content Script에서 인라인 버튼 클릭으로 온 요청
  if (request.action === 'uploadFromInline') {
    (async () => {
      try {
        console.log(`\n[Inline Button] 🔘 버튼 클릭됨`);
        const settings = await getSettings();

        // 서버 URL 확인
        if (!settings.serverUrl) {
          console.error(`[Inline Button] ❌ 서버 URL이 설정되지 않음`);
          showResultNotification('error', chrome.i18n.getMessage('notificationServerNotConfigured'));
          sendResponse({ success: false, error: 'Server URL not configured' });
          return;
        }

        console.log(`[Inline Button] ✅ 서버 설정 확인됨: ${settings.serverUrl}`);

        // Torrent 정보 파싱
        console.log(`[Inline Button] 🔍 토렌트 정보 파싱 중...`);
        const torrentInfo = parseTorrentFromText(request.torrent);
        if (!torrentInfo) {
          console.error(`[Inline Button] ❌ 유효한 토렌트 정보 없음: ${request.torrent}`);
          showResultNotification('error', chrome.i18n.getMessage('notificationNoTorrentFound'));
          sendResponse({ success: false, error: 'Invalid torrent format' });
          return;
        }

        console.log(`[Inline Button] ✅ 파싱 완료:`, {
          type: torrentInfo.type,
          magnetLink: torrentInfo.magnetLink
        });

        // 업로드 시작
        console.log(`[Inline Button] ⏳ 업로드 시작...`);
        showResultNotification('processing', chrome.i18n.getMessage('notificationUploading'), { torrent: request.torrent });

        const result = await addTorrentToTransmission(settings.serverUrl, torrentInfo, settings.username, settings.password);

        if (result.success) {
          const message = result.type === 'added'
            ? '새로운 토렌트 추가됨'
            : '이미 올라간 토렌트입니다';
          console.log(`[Inline Button] ✅ 업로드 성공!`);
          console.log(`[Inline Button] 📊 상태: ${result.type}`);
          console.log(`[Inline Button] 📌 토렌트 ID: ${result.torrentId}`);
          console.log(`[Inline Button] 🔐 Hash: ${result.hashString}\n`);
          showResultNotification(result.type, message, {
            torrentId: result.torrentId,
            hashString: result.hashString,
            torrent: request.torrent
          });
          sendResponse({ success: true, type: result.type });
        } else {
          console.error(`[Inline Button] ❌ 업로드 실패:`, result.error);
          showResultNotification('error', `오류: ${result.error}`);
          sendResponse({ success: false, error: result.error });
        }
      } catch (error) {
        console.error(`[Inline Button] ❌ 예외 오류:`, error.message);
        showResultNotification('error', `오류: ${error.message}`);
        sendResponse({ success: false, error: error.message });
      }
    })();

    return true; // 비동기 응답
  }
});
