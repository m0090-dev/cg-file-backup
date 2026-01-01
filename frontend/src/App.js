import {
  SelectAnyFile,
  SelectBackupFolder,
  CopyBackupFile,
  ArchiveBackupFile,
  GetI18N,
  BackupOrDiff,
  GetBackupList,  // 名称変更に対応
  RestoreBackup,   // 新設の万能復元関数
  GetFileSize
} from '../wailsjs/go/main/App';

let i18n = null;
let workFile = '';
let workFileSize = 0;
let backupDir = '';

const MAX_BSDIFF_SIZE = 100 * 1024 * 1024; // Bsdiff用: 100MB

// --- ユーティリティ ---
function formatSize(bytes) {
  if (bytes === undefined || bytes === null || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setHistoryMessage(msg) {
  const list = document.getElementById('diff-history-list');
  if (!list) return;
  list.innerHTML = `<div class="info-msg">${msg}</div>`;
}

// --- プログレスバーの制御 ---
function toggleProgress(show, text = "Processing...") {
  const container = document.getElementById('progress-container');
  const bar = document.getElementById('progress-bar');
  const status = document.getElementById('progress-status');
  const btn = document.getElementById('execute-backup-btn');

  if (show) {
    container.style.display = 'block';
    status.style.display = 'block';
    status.textContent = text;
    bar.style.width = '0%';
    btn.disabled = true; 
    
    let width = 0;
    const interval = setInterval(() => {
      if (width >= 95) {
        clearInterval(interval);
      } else {
        width += (100 - width) * 0.1; 
        bar.style.width = width + '%';
      }
    }, 500);
    return interval;
  } else {
    bar.style.width = '100%';
    setTimeout(() => {
      container.style.display = 'none';
      status.style.display = 'none';
      btn.disabled = false;
    }, 1000);
    return null;
  }
}

// --- 初期化 ---
async function Initialize() {
  const data = await GetI18N();
  if (!data) return;
  i18n = data;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setQueryText = (sel, text) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  };

  setQueryText('.action-section h3', i18n.newBackupTitle);
  setQueryText('.history-section h3', i18n.historyTitle);
  setText('workfile-btn', i18n.workFileBtn);
  setText('backupdir-btn', i18n.backupDirBtn);
  setText('execute-backup-btn', i18n.executeBtn);
  setText('refresh-diff-btn', i18n.refreshBtn);
  setText('apply-selected-btn', i18n.applyBtn);
  setText('select-all-btn', i18n.selectAllBtn);

  const titles = document.querySelectorAll('.mode-title');
  const descs = document.querySelectorAll('.mode-desc');
  if (titles.length >= 3) {
    titles[0].textContent = i18n.fullCopyTitle; descs[0].textContent = i18n.fullCopyDesc;
    titles[1].textContent = i18n.archiveTitle; descs[1].textContent = i18n.archiveDesc;
    titles[2].textContent = i18n.diffTitle; descs[2].textContent = i18n.diffDesc;
  }

  UpdateDisplay();
  UpdateHistory();
}

// --- 表示更新 ---
function UpdateDisplay() {
  if (!i18n) return;

  const fileEl = document.getElementById('selected-workfile');
  const dirEl = document.getElementById('selected-backupdir');

  if (fileEl) {
    const fileName = workFile ? workFile.split(/[\\/]/).pop() : i18n.selectedWorkFile;
    const sizeStr = workFile ? ` [${formatSize(workFileSize)}]` : "";
    fileEl.textContent = fileName + sizeStr;
  }
  if (dirEl) {
    dirEl.textContent = backupDir ? "Custom Path" : i18n.selectedBackupDir;
  }

  const radios = document.querySelectorAll('input[name="backupMode"]');
  let currentMode = 'copy';
  
  radios.forEach(radio => {
    const card = radio.closest('.mode-card');
    if (radio.checked) {
      currentMode = radio.value;
      if (card) card.classList.add('selected');
    } else {
      if (card) card.classList.remove('selected');
    }
  });

  const archiveFmt = document.getElementById('archive-format')?.value;
  const pwdInput = document.getElementById('archive-password');
  const pwdArea = document.getElementById('password-area');
  if (pwdInput && pwdArea) {
    const isPassMode = (currentMode === 'archive' && archiveFmt === 'zip-pass');
    pwdInput.disabled = !isPassMode;
    pwdArea.style.opacity = isPassMode ? "1" : "0.3";
  }

  // バックアップ履歴セクションは常時活性
  const history = document.getElementById('history-section');
  if (history) {
    history.style.opacity = "1";
    history.style.pointerEvents = "auto";
  }

  const diffRadio = document.querySelector('input[value="diff"]');
  const diffLabel = diffRadio?.closest('label');
  const selectedAlgo = document.getElementById('diff-algo')?.value || 'hdiff';
  const shouldDisable = (selectedAlgo === 'bsdiff' && workFileSize > MAX_BSDIFF_SIZE);

  if (diffRadio) {
    diffRadio.disabled = shouldDisable;
    if (shouldDisable && diffRadio.checked) {
      document.querySelector('input[value="copy"]').checked = true;
      UpdateDisplay();
      return;
    }
    if (diffLabel) {
      diffLabel.style.opacity = shouldDisable ? "0.4" : "1";
    }
  }
}

// --- 履歴リストの更新 (全形式表示・復元対応) ---
async function UpdateHistory() {
  if (!i18n) return;
  const list = document.getElementById('diff-history-list');
  if (!list) return;

  if (!workFile) {
    setHistoryMessage(i18n.selectFileFirst);
    return;
  }

  try {
    // すべてのバックアップファイルを取得
    const data = await GetBackupList(workFile, backupDir);
    if (!data || data.length === 0) {
      setHistoryMessage(i18n.noHistory);
      return;
    }

    data.sort((a, b) => b.fileName.localeCompare(a.fileName));
    list.innerHTML = data.map(item => {
      const sizeStr = formatSize(item.FileSize);
      
      return `
        <div class="diff-item">
          <label style="display:flex; align-items:center; cursor:pointer; width:100%;">
            <input type="checkbox" class="diff-checkbox" value="${item.filePath}" style="margin-right:10px; flex-shrink:0;">
            <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
              <span class="diff-name" title="${item.fileName}" style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  ${item.fileName} <span style="font-weight:normal; font-size:10px; color:#0078d4;">(${sizeStr})</span>
              </span>
              <span style="font-size:10px; color:#666;">Time: ${item.timestamp}</span>
            </div>
          </label>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error(err);
  }
}

// --- 実行処理 ---
async function OnExecute() {
  if (!workFile) { alert(i18n.selectFileFirst); return; }
  const mode = document.querySelector('input[name="backupMode"]:checked').value;
  const msgArea = document.getElementById('message-area');

  const timer = toggleProgress(true, i18n.processingMsg || "Processing...");

  try {
    let successText = "";
    if (mode === 'copy') {
      await CopyBackupFile(workFile, backupDir);
      successText = i18n.copyBackupSuccess;
    } else if (mode === 'archive') {
      let fmt = document.getElementById('archive-format').value;
      let pwd = "";
      if (fmt === "zip-pass") {
        pwd = document.getElementById('archive-password').value;
        if (!pwd) throw new Error("Password is required for encrypted ZIP.");
        fmt = "zip";
      }
      await ArchiveBackupFile(workFile, backupDir, fmt, pwd);
      successText = i18n.archiveBackupSuccess.replace('{format}', fmt.toUpperCase());
    } else if (mode === 'diff') {
      const algo = document.getElementById('diff-algo').value;
      await BackupOrDiff(workFile, backupDir, algo);
      successText = `${i18n.diffBackupSuccess} (${algo.toUpperCase()})`;
    }

    if (timer) clearInterval(timer);
    toggleProgress(false);

    msgArea.textContent = successText;
    msgArea.classList.remove('hidden');
    setTimeout(() => msgArea.classList.add('hidden'), 3000);
    
    UpdateHistory();
  } catch (err) {
    if (timer) clearInterval(timer);
    toggleProgress(false);
    alert(err);
  }
}

// --- イベントリスナー ---
document.addEventListener('DOMContentLoaded', Initialize);

window.addEventListener('click', async (e) => {
  if (!i18n) return;
  const id = e.target.id;

  if (id === 'workfile-btn') {
    const res = await SelectAnyFile(i18n.workFileBtn, [{ DisplayName: "Target", Pattern: "*.*" }]);
    if (res) {
      workFile = res;
      workFileSize = await GetFileSize(res);
      UpdateDisplay();
      UpdateHistory();
    }
  } else if (id === 'backupdir-btn') {
    const res = await SelectBackupFolder();
    if (res) {
      backupDir = res;
      UpdateDisplay();
      UpdateHistory();
    }
  } else if (id === 'execute-backup-btn') {
    OnExecute();
  } else if (id === 'refresh-diff-btn') {
    UpdateHistory();
  } else if (id === 'select-all-btn') {
    const checkboxes = Array.from(document.querySelectorAll('.diff-checkbox'));
    if (checkboxes.length === 0) return;
    const allChecked = checkboxes.every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
  } else if (id === 'apply-selected-btn') {
    const targets = Array.from(document.querySelectorAll('.diff-checkbox:checked')).map(el => el.value);

    if (targets.length > 0 && confirm(i18n.restoreConfirm)) {
      const timer = toggleProgress(true, "Restoring...");
      try {
        // 全形式対応の RestoreBackup を順次実行
        for (const path of targets) {
          await RestoreBackup(path, workFile);
        }
        if (timer) clearInterval(timer);
        toggleProgress(false);
        alert(i18n.diffApplySuccess);
        UpdateHistory();
      } catch (err) {
        if (timer) clearInterval(timer);
        toggleProgress(false);
        alert("Restore Error: " + err);
      }
    }
  }
});

document.addEventListener('change', (e) => {
  const ids = ['backupMode', 'diff-algo', 'archive-format'];
  if (ids.includes(e.target.name) || ids.includes(e.target.id)) {
    UpdateDisplay();
    if (e.target.type === 'radio') e.target.focus();
  }
});
