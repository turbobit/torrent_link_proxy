// i18n 메시지 로드 유틸리티 함수
function loadI18nMessages() {
  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(element => {
    const messageKey = element.getAttribute('data-i18n');
    const message = chrome.i18n.getMessage(messageKey);
    if (message) {
      element.textContent = message;
    }
  });

  // placeholder 속성 처리
  const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
  placeholderElements.forEach(element => {
    const messageKey = element.getAttribute('data-i18n-placeholder');
    const message = chrome.i18n.getMessage(messageKey);
    if (message) {
      element.placeholder = message;
    }
  });
}

// 설정 로드
function getSettings() {
  return new Promise((resolve) => {
    console.log('[Settings] 📂 설정 로드 중...');
    chrome.storage.sync.get(['transmissionSettings', 'notificationStyles', 'allowedUrls', 'inlineButton'], (data) => {
      console.log('[Settings] 📥 스토리지에서 읽은 데이터:', data);

      const settings = {
        serverUrl: data.transmissionSettings?.serverUrl || '',
        username: data.transmissionSettings?.username || '',
        password: data.transmissionSettings?.password || '',
        notificationStyles: data.notificationStyles || ['badge', 'notification'],
        allowedUrls: data.allowedUrls || [],
        inlineButton: data.inlineButton !== undefined ? data.inlineButton : true
      };

      console.log('[Settings] ✅ 설정 로드 완료:', {
        serverUrl: settings.serverUrl,
        allowedUrls: settings.allowedUrls,
        notificationStyles: settings.notificationStyles,
        inlineButton: settings.inlineButton
      });

      resolve(settings);
    });
  });
}

// 설정 저장
function saveSettings(settings) {
  return new Promise((resolve) => {
    console.log('[Settings] 💾 설정 저장 중...', {
      serverUrl: settings.serverUrl,
      notificationStyles: settings.notificationStyles,
      allowedUrls: settings.allowedUrls,
      inlineButton: settings.inlineButton
    });

    const dataToSave = {
      transmissionSettings: {
        serverUrl: settings.serverUrl,
        username: settings.username,
        password: settings.password
      },
      notificationStyles: settings.notificationStyles,
      allowedUrls: settings.allowedUrls,
      inlineButton: settings.inlineButton
    };

    chrome.storage.sync.set(dataToSave, () => {
      if (chrome.runtime.lastError) {
        console.error('[Settings] ❌ 저장 실패:', chrome.runtime.lastError);
      } else {
        console.log('[Settings] ✅ 저장 완료');
      }
      resolve();
    });
  });
}

// 서버 URL 정규화 함수
function normalizeServerUrl(url) {
  if (!url) return '';

  url = url.trim();

  // 프로토콜 추가 (없으면)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }

  // 포트가 없으면 9091 추가
  try {
    const urlObj = new URL(url);
    if (!urlObj.port) {
      urlObj.port = '9091';
    }
    return urlObj.toString().replace(/\/$/, ''); // 끝의 / 제거
  } catch (e) {
    // URL 파싱 실패 시 그대로 반환
    return url;
  }
}

// Transmission 서버 연결 테스트
async function testConnection(serverUrl, username, password) {
  return new Promise((resolve) => {
    // RPC 엔드포인트 생성
    let rpcUrl = serverUrl;
    if (!rpcUrl.endsWith('/')) {
      rpcUrl += '/';
    }
    rpcUrl += 'rpc';

    // 세션 ID 초기화
    let sessionId = null;

    // 기본 session-get 요청
    const request = {
      jsonrpc: '2.0',
      method: 'session-get',
      id: Math.floor(Math.random() * 1000000)
    };

    const headers = {
      'Content-Type': 'application/json',
    };

    // 인증 헤더 추가 ( Basic Auth )
    if (username || password) {
      const base64Credentials = btoa(`${username}:${password}`);
      headers['Authorization'] = `Basic ${base64Credentials}`;
    }

    fetch(rpcUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(request)
    })
    .then(response => {
      // 409 Conflict는 세션 ID가 필요함을 의미
      if (response.status === 409) {
        sessionId = response.headers.get('X-Transmission-Session-Id');
        headers['X-Transmission-Session-Id'] = sessionId;
        return fetch(rpcUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(request)
        });
      }
      return response;
    })
    .then(response => {
      if (response.ok) {
        return response.json().then(data => {
          return { success: true, version: data.result?.version };
        });
      }
      return response.text().then(text => {
        throw new Error(`HTTP ${response.status}: ${text}`);
      });
    })
    .catch(error => {
      // 인증 오류 확인
      if (error.message.includes('401') || error.message.includes('403')) {
        return { success: false, error: '인증 실패. 사용자 이름과 비밀번호를 확인하세요.' };
      }
      return { success: false, error: error.message };
    })
    .then(result => {
      resolve(result);
    });
  });
}

// DOM이 로드된 후 초기화
document.addEventListener('DOMContentLoaded', () => {
  // i18n 메시지 로드
  loadI18nMessages();

  const serverUrlInput = document.getElementById('serverUrl');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const notificationStyleInputs = document.querySelectorAll('input[name="notificationStyle"]');
  const inlineButtonInput = document.getElementById('inlineButton');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');
  const testResult = document.getElementById('testResult');
  const urlList = document.getElementById('urlList');
  const newUrlInput = document.getElementById('newUrl');
  const addUrlBtn = document.getElementById('addUrlBtn');

  let currentSettings = {};

  // 현재 설정 로드
  getSettings().then(settings => {
    console.log('[UI] 📥 설정 UI에 로드됨:', settings);
    currentSettings = settings;
    serverUrlInput.value = settings.serverUrl || '';
    usernameInput.value = settings.username || '';
    passwordInput.value = settings.password || '';

    // 알림 방식 선택 (중복 선택 가능)
    notificationStyleInputs.forEach(input => {
      input.checked = settings.notificationStyles.includes(input.value);
    });

    // 인라인 버튼 설정
    inlineButtonInput.checked = settings.inlineButton;

    // URL 리스트 표시
    console.log('[URL List] 📋 표시할 allowedUrls:', settings.allowedUrls);
    renderUrlList(settings.allowedUrls);
  });

  // URL 리스트 렌더링
  function renderUrlList(urls) {
    urlList.innerHTML = urls.map((url, index) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; background-color: #f0f0f0; border-radius: 4px; margin-bottom: 8px;">
        <span>${url}</span>
        <button onclick="removeUrl(${index})" style="padding: 4px 12px; background-color: #dc3545; font-size: 12px;">제거</button>
      </div>
    `).join('');
  }

  // URL 제거 함수 (전역)
  window.removeUrl = function(index) {
    console.log('[URL List] 🗑️ URL 제거:', currentSettings.allowedUrls[index]);
    currentSettings.allowedUrls.splice(index, 1);
    console.log('[URL List] 📝 남은 URL 목록:', currentSettings.allowedUrls);
    renderUrlList(currentSettings.allowedUrls);
  };

  // URL 추가 버튼
  addUrlBtn.addEventListener('click', () => {
    const url = newUrlInput.value.trim();
    console.log('[URL List] ➕ URL 추가 시도:', url);

    if (!url) {
      console.warn('[URL List] ⚠️ 빈 URL');
      showErrorMessage('URL을 입력하세요.');
      return;
    }

    if (currentSettings.allowedUrls.includes(url)) {
      console.warn('[URL List] ⚠️ 중복 URL');
      showErrorMessage('이미 추가된 URL입니다.');
      return;
    }

    currentSettings.allowedUrls.push(url);
    console.log('[URL List] ✅ URL 추가됨:', currentSettings.allowedUrls);
    renderUrlList(currentSettings.allowedUrls);
    newUrlInput.value = '';
  });

  // Enter 키로도 추가 가능
  newUrlInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addUrlBtn.click();
    }
  });

  // 저장 버튼 클릭
  saveBtn.addEventListener('click', () => {
    console.log('[UI] 💾 저장 버튼 클릭');

    let serverUrl = serverUrlInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!serverUrl) {
      showErrorMessage('서버 URL을 입력하세요.');
      return;
    }

    // URL 정규화
    const normalizedUrl = normalizeServerUrl(serverUrl);
    if (!normalizedUrl) {
      showErrorMessage('유효한 URL 형식이 아닙니다.');
      return;
    }

    // 정규화된 URL로 업데이트
    serverUrl = normalizedUrl;
    serverUrlInput.value = normalizedUrl;

    // 체크된 알림 방식들을 배열로 수집
    const notificationStyles = Array.from(notificationStyleInputs)
      .filter(input => input.checked)
      .map(input => input.value);

    console.log('[UI] 📋 저장할 설정:', {
      serverUrl: serverUrl,
      allowedUrls: currentSettings.allowedUrls,
      notificationStyles: notificationStyles,
      inlineButton: inlineButtonInput.checked
    });

    saveSettings({
      serverUrl: serverUrl,
      username: username,
      password: password,
      notificationStyles: notificationStyles,
      allowedUrls: currentSettings.allowedUrls,
      inlineButton: inlineButtonInput.checked
    }).then(() => {
      console.log('[UI] ✅ 설정 저장 완료');
      showSuccessMessage('설정이 저장되었습니다!');
      // 메뉴 업데이트 메시지 전송
      chrome.runtime.sendMessage({ action: 'updateMenu' });
    });
  });

  // 연결 테스트 버튼 클릭
  testBtn.addEventListener('click', () => {
    let serverUrl = serverUrlInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!serverUrl) {
      showTestResult(false, '서버 URL을 입력하세요.');
      return;
    }

    // URL 정규화
    const normalizedUrl = normalizeServerUrl(serverUrl);
    if (!normalizedUrl) {
      showTestResult(false, '유효한 URL 형식이 아닙니다.');
      return;
    }

    showTestResult(null, `연결 중... (${normalizedUrl})`);

    testConnection(normalizedUrl, username, password).then(result => {
      if (result.success) {
        showTestResult(true, `✓ 성공! Transmission v${result.version}에 연결되었습니다.\n\n입력된 URL: ${normalizedUrl}`);
      } else {
        showTestResult(false, `✗ 연결 실패: ${result.error}\n\n입력된 URL: ${normalizedUrl}`);
      }
    });
  });

  function showSuccessMessage(message) {
    successMsg.textContent = message;
    successMsg.style.display = 'block';
    setTimeout(() => {
      successMsg.style.display = 'none';
    }, 3000);
  }

  function showErrorMessage(message) {
    errorMsg.textContent = message;
    errorMsg.style.display = 'block';
    setTimeout(() => {
      errorMsg.style.display = 'none';
    }, 3000);
  }

  function showTestResult(success, message) {
    testResult.textContent = message;
    testResult.className = 'test-result';
    if (success === null) {
      testResult.style.display = 'none';
    } else if (success) {
      testResult.style.display = 'block';
      testResult.classList.add('success');
    } else {
      testResult.style.display = 'block';
      testResult.classList.add('error');
    }
  }
});
