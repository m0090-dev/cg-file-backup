
import {
  SelectWorkFile,
  SelectBackupFolder,
  CopyBackupFile,
  ArchiveBackupFile,
  GetI18N
} from '../wailsjs/go/main/App';

let i18n = {};
let workFile = '';
let backupDir = '';

// メッセージ表示
function showMessage(text) {
  const el = document.getElementById('message-area');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => {
    el.classList.add('hidden');
  }, 3000);
}

// i18nロード
async function loadI18NOnce() {
  i18n = await GetI18N();
  applyI18N();

  // Backupタブ名もi18n適用
  const mainTabButton = document.querySelector('.tab-link[data-tab="main-tab"]');
  if (mainTabButton) mainTabButton.textContent = i18n.copyBackupBtn; // Backupタブ名
}

// i18n適用
function applyI18N() {
  document.getElementById('workfile-btn').textContent = i18n.workFileBtn;
  document.getElementById('backupdir-btn').textContent = i18n.backupDirBtn;
  document.getElementById('execute-backup-btn').textContent = i18n.executeBtn;
  
  const diffSettingsBtn = document.getElementById('diff-settings-btn');
  if (diffSettingsBtn) diffSettingsBtn.textContent = i18n.diffBackupBtn; // 追加：差分設定ボタン

  document.querySelector('input[value="copy"]').parentElement.lastChild.textContent =
    ' ' + i18n.copyBackupBtn;
  document.querySelector('input[value="archive"]').parentElement.lastChild.textContent =
    ' ' + i18n.archiveBtn;
  document.querySelector('input[value="diff"]').parentElement.lastChild.textContent =
    ' ' + i18n.diffBackupBtn;

  updateSelectionInfo();
}

// 選択情報更新
function updateSelectionInfo() {
  document.getElementById('selected-workfile').textContent =
    workFile || i18n.selectedWorkFile;
  document.getElementById('selected-backupdir').textContent =
    backupDir || i18n.selectedBackupDir;
}

// ファイル選択
function selectWorkFileJS() {
  SelectWorkFile().then(path => {
    if (path) workFile = path;
    updateSelectionInfo();
  });
}

// バックアップフォルダ選択
function selectBackupFolderJS() {
  SelectBackupFolder().then(path => {
    if (path) backupDir = path;
    updateSelectionInfo();
  });
}

// バックアップモードに応じてUI切替
function updateBackupModeUI() {
  const mode = document.querySelector('input[name="backupMode"]:checked').value;
  const archiveOptions = document.getElementById('archive-options');
  const diffSettingsContainer = document.getElementById('diff-settings-container');

  if (mode === 'archive') {
    archiveOptions.classList.remove('hidden');
  } else {
    archiveOptions.classList.add('hidden');
  }

  if (mode === 'diff') {
    diffSettingsContainer.classList.remove('hidden');
  } else {
    diffSettingsContainer.classList.add('hidden');
  }
}

// タブ切り替え
function switchTab(tabId) {
  document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tab => {
    if (tab.id === tabId) {
      tab.classList.add('active');
      tab.style.display = 'block';
    } else {
      tab.classList.remove('active');
      tab.style.display = 'none';
    }
  });

  const btn = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
}

// タブ閉じる
function closeTab(tabId) {
  if (tabId === 'main-tab') return; // Backupタブは絶対に閉じられない

  const tabHeader = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
  const tabContent = document.getElementById(tabId);

  if (tabHeader) tabHeader.remove();
  if (tabContent) tabContent.remove();

  switchTab('main-tab'); // Backupタブに切り替え
}

// 差分設定タブ作成
function openDiffSettingsTab() {
  const tabId = 'diff-settings-tab';
  if (document.getElementById(tabId)) {
    switchTab(tabId);
    return;
  }

  // ヘッダー追加
  const tabHeaders = document.getElementById('tab-headers');
  const newHeader = document.createElement('button');
  newHeader.className = 'tab-link';
  newHeader.dataset.tab = tabId;
  newHeader.textContent = i18n.diffBackupBtn;

  // 右クリックで閉じる
  newHeader.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    closeTab(tabId);
  });

  newHeader.onclick = () => switchTab(tabId);
  tabHeaders.appendChild(newHeader);

  // タブ内容を新規作成
  const tabContents = document.getElementById('tab-contents');
  const newTab = document.createElement('div');
  newTab.id = tabId;
  newTab.className = 'tab-content';
  newTab.style.display = 'none'; // 初期状態は非表示
  newTab.innerHTML = `
    <h3>${i18n.diffBackupBtn}</h3>
    <label><input type="radio" name="diffMode" value="diff" checked> ${i18n.diffMode}</label>
    <label><input type="radio" name="diffMode" value="incremental"> ${i18n.incrementalMode}</label>
    <br>
    <label><input type="checkbox" id="compress-diff"> ${i18n.compressDiff}</label>
    <select id="diff-compress-format">
      <option value="zip">ZIP</option>
      <option value="tar">TAR</option>
    </select>
  `;
  tabContents.appendChild(newTab);

  switchTab(tabId);
}

// バックアップ実行
function executeBackupJS() {
  if (!workFile) {
    showMessage(i18n.selectedWorkFile);
    return;
  }

  const mode = document.querySelector('input[name="backupMode"]:checked').value;

  if (mode === 'copy') {
    CopyBackupFile(workFile, backupDir)
      .then(() => showMessage(i18n.copyBackupSuccess))
      .catch(err => alert(err));
  } else if (mode === 'archive') {
    const format = document.getElementById('archive-format').value;
    ArchiveBackupFile(workFile, backupDir, format)
      .then(() => showMessage(
        i18n.archiveBackupSuccess.replace('{format}', format.toUpperCase())
      ))
      .catch(err => alert(err));
  } else if (mode === 'diff') {
    const diffMode = document.querySelector('input[name="diffMode"]:checked')?.value || 'diff';
    const compress = document.getElementById('compress-diff')?.checked || false;
    const compressFormat = document.getElementById('diff-compress-format')?.value || 'zip';

    console.log('Diff Backup Execute', { diffMode, compress, compressFormat });
    // DiffBackupFile(workFile, backupDir, diffMode, compress, compressFormat) をここで呼び出す
  }
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('workfile-btn').onclick = selectWorkFileJS;
  document.getElementById('backupdir-btn').onclick = selectBackupFolderJS;
  document.getElementById('execute-backup-btn').onclick = executeBackupJS;
  document.getElementById('diff-settings-btn').onclick = openDiffSettingsTab;

  document.querySelectorAll('input[name="backupMode"]').forEach(radio => {
    radio.addEventListener('change', updateBackupModeUI);
  });

  // HTML 側の既存 Backup ボタンにクリックイベント付与
  const mainTabButton = document.querySelector('.tab-link[data-tab="main-tab"]');
  if (mainTabButton) {
    mainTabButton.onclick = () => switchTab('main-tab');
  }

  updateBackupModeUI();
  loadI18NOnce();

  // 初期タブを HTML 側の Backup タブに切り替え
  switchTab('main-tab');
});
