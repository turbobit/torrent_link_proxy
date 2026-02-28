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

    // 요청할 호스트 권한 패턴 생성 (origin/*)
    let originPattern = null;
    try {
      const origin = new URL(serverUrl).origin;
      originPattern = origin.replace(/\/$/, '') + '/*';
    } catch (e) {
      console.warn('[Permissions] ⚠️ origin 패턴 생성 실패:', e);
    }

    // 권한 요청 (가능한 경우)
    const requestSave = () => saveSettings({
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

    if (originPattern && chrome.permissions && chrome.permissions.request) {
      console.log('[Permissions] 🔐 요청할 origin 패턴:', originPattern);
      chrome.permissions.request({ origins: [originPattern] }, (granted) => {
        if (granted) {
          console.log('[Permissions] ✅ 호스트 권한 승인됨:', originPattern);
          requestSave();
        } else {
          console.warn('[Permissions] ❌ 호스트 권한 거부됨:', originPattern);
          // 권한이 없으면 저장은 하되 사용자에게 안내
          requestSave().then(() => {
            showErrorMessage('호스트 권한이 허용되지 않았습니다. 일부 기능이 제한될 수 있습니다.');
          });
        }
      });
    } else {
      // 권한 API가 없거나 originPattern 생성 실패 시 그냥 저장
      requestSave();
    }
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

    chrome.runtime.sendMessage({
      action: 'testConnection',
      serverUrl: normalizedUrl,
      username: username,
      password: password
    }, (result) => {
      if (chrome.runtime.lastError) {
        showTestResult(false, `✗ 확장 오류: ${chrome.runtime.lastError.message}`);
        return;
      }
      if (result?.success) {
        showTestResult(true, `✓ 성공! Transmission v${result.version}에 연결되었습니다.\n\n입력된 URL: ${normalizedUrl}`);
      } else {
        showTestResult(false, `✗ 연결 실패: ${result?.error || '알 수 없는 오류'}\n\n입력된 URL: ${normalizedUrl}`);
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
