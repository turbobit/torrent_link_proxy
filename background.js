// Transmission 서버 설정 저장 키
const SETTINGS_KEY = 'transmissionSettings';

// 기본 설정
const defaultSettings = {
  serverUrl: 'http://192.168.0.201:9091',
  username: '',
  password: ''
};

// 전역 세션 ID (CSRF 보호용)
let globalSessionId = null;

// 설정 로드
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(SETTINGS_KEY, (data) => {
      const settings = data[SETTINGS_KEY] || defaultSettings;
      resolve(settings);
    });
  });
}

// 설정 저장
function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ [SETTINGS_KEY]: settings }, () => {
      resolve();
    });
  });
}

// RPC 요청 유틸리티
function transmissionRpc(serverUrl, method, params = null) {
  return new Promise((resolve, reject) => {
    const rpcUrl = serverUrl.endsWith('/') ? `${serverUrl}rpc` : `${serverUrl}/rpc`;

    const request = {
      jsonrpc: '2.0',
      method: method,
      id: Math.floor(Math.random() * 1000000)
    };

    if (params) {
      request.params = params;
    }

    const headers = {
      'Content-Type': 'application/json',
    };

    // 세션 ID가 있으면 추가 (CSRF 보호)
    if (globalSessionId) {
      headers['X-Transmission-Session-Id'] = globalSessionId;
    }

    fetch(rpcUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(request)
    })
    .then(response => {
      // 409 Conflict는 세션 ID가 유효하지 않을 때 발생 -> 갱신 후 재시도
      if (response.status === 409) {
        globalSessionId = response.headers.get('X-Transmission-Session-Id');
        return fetch(rpcUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Transmission-Session-Id': globalSessionId
          },
          body: JSON.stringify(request)
        });
      }
      return response;
    })
    .then(response => {
      if (!response.ok) {
        return response.text().then(text => {
          throw new Error(`HTTP error! status: ${response.status}, body: ${text}`);
        });
      }
      return response.json();
    })
    .then(data => {
      if (data.error) {
        throw new Error(data.error);
      }
      resolve(data.result);
    })
    .catch(error => {
      reject(error);
    });
  });
}

// Transmission 서버 연결 테스트
async function testConnection(serverUrl) {
  try {
    globalSessionId = null; // 세션 ID 초기화
    const result = await transmissionRpc(serverUrl, 'session-get');
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
  const hexHashMatch = trimmedText.match(/^[a-fA-F0-9]{40}$/);
  if (hexHashMatch) {
    return {
      type: 'hash',
      infoHash: hexHashMatch[0].toUpperCase(),
      magnetLink: `magnet:?xt=urn:btih:${hexHashMatch[0].toUpperCase()}`
    };
  }

  // 3. 32자 Base32 해시 확인
  const base32HashMatch = trimmedText.match(/^[a-zA-Z2-7]{32}$/);
  if (base32HashMatch) {
    return {
      type: 'hash',
      infoHash: base32HashMatch[0].toUpperCase(),
      magnetLink: `magnet:?xt=urn:btih:${base32HashMatch[0].toUpperCase()}`
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
    title: 'Transmission에 업로드',
    contexts: ['link'],
    targetUrlPatterns: [
      'magnet:*',
      '*://*/*.torrent'
    ]
  });

  // 텍스트 선택 시 ( info hash 직접 입력 가능 )
  chrome.contextMenus.create({
    id: 'upload With Hash',
    title: 'Transmission에 업로드 (해시값)',
    contexts: ['selection']
  });
}

// Magnet link 또는 torrent file을 Transmission에 추가
async function addTorrentToTransmission(serverUrl, torrentInfo) {
  globalSessionId = null; // 세션 ID 초기화

  try {
    let result;

    if (torrentInfo.type === 'magnet' || torrentInfo.type === 'hash') {
      // Magnet link 추가
      result = await transmissionRpc(serverUrl, 'torrent-add', {
        filename: torrentInfo.magnetLink
      });
    } else if (torrentInfo.type === 'torrent_file') {
      // torrent 파일은 Web UI를 통해 업로드 필요 (RPC는 base64 metainfo 필요)
      // Web UI의 #upload 섹션으로 리디렉션
      const webUrl = createWebUrl(serverUrl);
      const uploadUrl = `${webUrl}?magnet=${encodeURIComponent(torrentInfo.url)}`;
      chrome.tabs.create({ url: uploadUrl });
      return { success: true, redirect: true };
    }

    if (result) {
      return {
        success: true,
        torrentId: result?.['torrent-added']?.id,
        hashString: result?.['torrent-added']?.hashString
      };
    }

    return { success: false, error: 'Unknown error' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// 컨텍스트 메뉴 클릭 핸들러
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  const settings = await getSettings();
  const uploadUrl = createWebUrl(settings.serverUrl);

  switch (info.menuItemId) {
    case 'upload Torrent':
      // 링크가 magnet 링크인 경우
      if (info.linkUrl.startsWith('magnet:')) {
        const torrentInfo = parseTorrentFromText(info.linkUrl);
        if (torrentInfo) {
          const result = await addTorrentToTransmission(settings.serverUrl, torrentInfo);
          if (result.redirect) {
            // Web UI로 리디렉션됨
          } else if (result.success) {
            // 성공 알림
            chrome.action.setBadgeText({ text: 'OK' });
            chrome.action.setBadgeBackgroundColor({ color: '#00aa00' });
            setTimeout(() => {
              chrome.action.setBadgeText({ text: '' });
            }, 2000);
          } else {
            // 실패 알림
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
            setTimeout(() => {
              chrome.action.setBadgeText({ text: '' });
            }, 2000);
          }
        }
      }
      // torrent 파일 링크인 경우
      else if (info.linkUrl.toLowerCase().endsWith('.torrent')) {
        const torrentInfo = {
          type: 'torrent_file',
          url: info.linkUrl
        };
        const result = await addTorrentToTransmission(settings.serverUrl, torrentInfo);
        if (!result.redirect) {
          chrome.tabs.create({ url: info.linkUrl });
        }
      }
      break;

    case 'upload With Hash':
      // 선택한 텍스트에서 토렌트 정보 파싱
      const selectedText = info.selectionText.trim();
      const torrentInfo = parseTorrentFromText(selectedText);

      if (torrentInfo && (torrentInfo.type === 'magnet' || torrentInfo.type === 'hash')) {
        const result = await addTorrentToTransmission(settings.serverUrl, torrentInfo);
        if (result.redirect) {
          // Web UI로 리디렉션됨
        } else if (result.success) {
          // 성공 알림
          chrome.action.setBadgeText({ text: 'OK' });
          chrome.action.setBadgeBackgroundColor({ color: '#00aa00' });
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
          }, 2000);
        } else {
          // 실패 알림
          chrome.action.setBadgeText({ text: '!' });
          chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
          setTimeout(() => {
            chrome.action.setBadgeText({ text: '' });
          }, 2000);
        }
      } else {
        // 유효하지 않은 형식
        chrome.action.setBadgeText({ text: '!' });
        chrome.action.setBadgeBackgroundColor({ color: '#ff0000' });
        setTimeout(() => {
          chrome.action.setBadgeText({ text: '' });
        }, 2000);
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
});
