
import {
  SelectAnyFile,
  SelectBackupFolder,
  CopyBackupFile,
  ArchiveBackupFile,
  GetI18N,
  BackupOrDiff,
  ApplyMultiDiff,
  GetDiffList,
  GetFileSize
} from '../wailsjs/go/main/App';

let i18n = null;
let workFile = '';
let workFileSize = 0;
let backupDir = '';

const MAX_DIFF_SIZE = 100 * 1024 * 1024; // 100MB

function formatSize(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function setHistoryMessage(msg) {
  const list = document.getElementById('diff-history-list');
  if (!list) return;
  if (!i18n) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = `<div class="info-msg">${msg}</div>`;
}

async function Initialize() {
  const data = await GetI18N();
  if (!data) return;
  i18n = data;

  // 静的テキスト反映
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
  // 初期メッセージの強制設定は削除（ご要望通り）
}

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

  const currentMode = document.querySelector('input[name="backupMode"]:checked')?.value;
  const history = document.getElementById('history-section');

  if (history) {
    const isDiff = currentMode === 'diff';
    history.style.opacity = isDiff ? "1" : "0.4";
    history.style.pointerEvents = isDiff ? "auto" : "none";

    if (!isDiff) {
      setHistoryMessage(i18n.selectDiffModeMsg);
    }
  }

  // 100MB制限
  const diffRadio = document.querySelector('input[value="diff"]');
  const diffLabel = diffRadio?.closest('label');
  if (workFileSize > MAX_DIFF_SIZE) {
    if (diffRadio) {
      diffRadio.disabled = true;
      if (diffRadio.checked) document.querySelector('input[value="copy"]').checked = true;
    }
    if (diffLabel) {
      diffLabel.style.opacity = "0.4";
      diffLabel.title = i18n.diffDisabledTooltip;
    }
  } else if (diffRadio) {
    diffRadio.disabled = false;
    if (diffLabel) {
      diffLabel.style.opacity = "1";
      diffLabel.title = "";
    }
  }
}

async function UpdateHistory() {
  if (!i18n) return;
  const list = document.getElementById('diff-history-list');
  if (!list) return;

  const currentMode = document.querySelector('input[name="backupMode"]:checked')?.value;
  if (currentMode !== 'diff') return;

  if (!workFile) {
    setHistoryMessage(i18n.selectFileFirst);
    return;
  }

  try {
    const data = await GetDiffList(workFile, backupDir);
    if (!data || data.length === 0) {
      setHistoryMessage(i18n.noHistory);
      return;
    }

    data.sort((a, b) => b.fileName.localeCompare(a.fileName));
    list.innerHTML = data.map(item => `
      <div class="diff-item">
        <label style="display:flex; align-items:center; cursor:pointer; width:100%;">
          <input type="checkbox" class="diff-checkbox" value="${item.filePath}" style="margin-right:10px;">
          <div style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
            <span class="diff-name" title="${item.fileName}" style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                ${item.fileName} <span style="font-weight:normal; font-size:11px; color:#0078d4;">(${formatSize(item.fileSize)})</span>
            </span>
            <span class="diff-ts" style="font-size:10px; color:#666;">Time: ${item.timestamp}</span>
          </div>
        </label>
      </div>
    `).join('');
  } catch (err) {
    console.error(err);
  }
}

// イベント登録
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
    if (res) { backupDir = res; UpdateDisplay(); UpdateHistory(); }
  } else if (id === 'execute-backup-btn') {
    OnExecute();
  } else if (id === 'refresh-diff-btn') {
    UpdateHistory();
  } else if (id === 'apply-selected-btn') {
    const targets = Array.from(document.querySelectorAll('.diff-checkbox:checked')).map(el => el.value);
    if (targets.length > 0 && confirm(i18n.restoreConfirm)) {
      await ApplyMultiDiff(workFile, targets);
      alert(i18n.diffApplySuccess);
      UpdateHistory();
    }
  }
});

document.addEventListener('change', (e) => {
  if (e.target.name === 'backupMode') {
    UpdateDisplay();
    UpdateHistory();
  }
});

async function OnExecute() {
  if (!workFile) { alert(i18n.selectFileFirst); return; }

  const mode = document.querySelector('input[name="backupMode"]:checked').value;
  const msgArea = document.getElementById('message-area');

  try {
    let successText = "";
    if (mode === 'copy') {
      await CopyBackupFile(workFile, backupDir);
      successText = i18n.copyBackupSuccess;
    } else if (mode === 'archive') {
      const fmt = document.getElementById('archive-format').value;
      await ArchiveBackupFile(workFile, backupDir, fmt);
      successText = i18n.archiveBackupSuccess.replace('{format}', fmt.toUpperCase());
    } else if (mode === 'diff') {
      await BackupOrDiff(workFile, backupDir);
      successText = i18n.diffBackupSuccess;
    }

    msgArea.textContent = successText;
    msgArea.classList.remove('hidden');
    setTimeout(() => msgArea.classList.add('hidden'), 3000);
    UpdateHistory();
  } catch (err) {
    alert(err);
  }
}
