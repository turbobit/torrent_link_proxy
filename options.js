// 설정 로드
function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get('transmissionSettings', (data) => {
      const settings = data.transmissionSettings || {
        serverUrl: 'http://192.168.0.201:9091',
        username: '',
        password: ''
      };
      resolve(settings);
    });
  });
}

// 설정 저장
function saveSettings(settings) {
  return new Promise((resolve) => {
    chrome.storage.sync.set({ transmissionSettings: settings }, () => {
      resolve();
    });
  });
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
  const serverUrlInput = document.getElementById('serverUrl');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const saveBtn = document.getElementById('saveBtn');
  const testBtn = document.getElementById('testBtn');
  const successMsg = document.getElementById('successMsg');
  const errorMsg = document.getElementById('errorMsg');
  const testResult = document.getElementById('testResult');

  // 현재 설정 로드
  getSettings().then(settings => {
    serverUrlInput.value = settings.serverUrl || '';
    usernameInput.value = settings.username || '';
    passwordInput.value = settings.password || '';
  });

  // 저장 버튼 클릭
  saveBtn.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!serverUrl) {
      showErrorMessage('서버 URL을 입력하세요.');
      return;
    }

    saveSettings({
      serverUrl: serverUrl,
      username: username,
      password: password
    }).then(() => {
      showSuccessMessage('설정이 저장되었습니다!');
      // 메뉴 업데이트 메시지 전송
      chrome.runtime.sendMessage({ action: 'updateMenu' });
    });
  });

  // 연결 테스트 버튼 클릭
  testBtn.addEventListener('click', () => {
    const serverUrl = serverUrlInput.value.trim();
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    if (!serverUrl) {
      showTestResult(false, '서버 URL을 입력하세요.');
      return;
    }

    showTestResult(null, '연결 중...');

    testConnection(serverUrl, username, password).then(result => {
      if (result.success) {
        showTestResult(true, `성공! Transmission v${result.version}에 연결되었습니다.`);
      } else {
        showTestResult(false, `연결 실패: ${result.error}`);
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
