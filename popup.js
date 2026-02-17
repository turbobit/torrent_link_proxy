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
    chrome.storage.sync.get('transmissionSettings', (data) => {
      const settings = data.transmissionSettings || {
        serverUrl: '',
        username: '',
        password: ''
      };
      resolve(settings);
    });
  });
}

// Transmission 서버 연결 테스트
async function testConnection(serverUrl, username, password) {
  return new Promise((resolve) => {
    let rpcUrl = serverUrl;
    if (!rpcUrl.endsWith('/')) {
      rpcUrl += '/';
    }
    rpcUrl += 'rpc';

    let sessionId = null;

    const request = {
      jsonrpc: '2.0',
      method: 'session-get',
      id: Math.floor(Math.random() * 1000000)
    };

    const headers = {
      'Content-Type': 'application/json',
    };

    if (username || password) {
      try {
        const base64Credentials = btoa(`${username}:${password}`);
        headers['Authorization'] = `Basic ${base64Credentials}`;
      } catch (e) {
        // btoa 실패 시 무시
      }
    }

    fetch(rpcUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(request)
    })
    .then(response => {
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
        throw new Error(`HTTP ${response.status}`);
      });
    })
    .catch(error => {
      if (error.message.includes('401') || error.message.includes('403')) {
        return { success: false, error: '인증 실패' };
      }
      return { success: false, error: error.message };
    })
    .then(result => {
      resolve(result);
    });
  });
}

// 팝업이 로드될 때 실행
document.addEventListener('DOMContentLoaded', () => {
  // i18n 메시지 로드
  loadI18nMessages();

  const statusDiv = document.getElementById('status');
  const serverStatusEl = document.getElementById('serverStatus');
  const serverUrlEl = document.getElementById('serverUrl');
  const checkBtn = document.getElementById('checkBtn');
  const checkLoading = document.getElementById('checkLoading');
  const checkText = document.getElementById('checkText');

  // 현재 설정 로드 및 표시
  getSettings().then(settings => {
    serverUrlEl.textContent = settings.serverUrl || '설정되지 않음';

    // 연결 테스트
    testConnection(settings.serverUrl, settings.username, settings.password)
      .then(result => {
        if (result.success) {
          statusDiv.className = 'status connected';
          serverStatusEl.textContent = `${chrome.i18n.getMessage('statusConnected')} (v${result.version})`;
          serverStatusEl.style.color = '#28a745';
        } else {
          statusDiv.className = 'status disconnected';
          serverStatusEl.textContent = chrome.i18n.getMessage('statusDisconnected');
          serverStatusEl.style.color = '#dc3545';
        }
      });
  });

  // 연결 확인 버튼
  checkBtn.addEventListener('click', () => {
    checkLoading.style.display = 'inline-block';
    checkText.style.display = 'none';

    getSettings().then(settings => {
      testConnection(settings.serverUrl, settings.username, settings.password)
        .then(result => {
          checkLoading.style.display = 'none';
          checkText.style.display = 'inline-block';

          if (result.success) {
            statusDiv.className = 'status connected';
            serverStatusEl.textContent = `연결됨 (v${result.version})`;
            serverStatusEl.style.color = '#28a745';
          } else {
            statusDiv.className = 'status error';
            serverStatusEl.textContent = `오류: ${result.error}`;
            serverStatusEl.style.color = '#dc3545';
          }
        });
    });
  });

  // 설정 버튼 클릭 (새 탭에서 설정 페이지 열기)
  document.body.addEventListener('click', (e) => {
    if (e.target.tagName === 'BODY' || e.target.classList.contains('instructions')) {
      chrome.runtime.openOptionsPage();
    }
  });
});
