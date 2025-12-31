import {
  SelectAnyFile,
  SelectBackupFolder,
  CopyBackupFile,
  ArchiveBackupFile,
  GetI18N,
  BackupOrDiff,
  ApplyMultiDiff,
  GetDiffList
} from '../wailsjs/go/main/App';

let i18n = {};
let workFile = '';
let backupDir = '';

async function Initialize() {
  i18n = await GetI18N();
  
  // UIラベルの反映
  document.querySelector('.action-section h3').textContent = i18n.newBackupTitle;
  document.querySelector('.history-section h3').textContent = i18n.historyTitle;
  document.getElementById('workfile-btn').textContent = i18n.workFileBtn;
  document.getElementById('backupdir-btn').textContent = i18n.backupDirBtn;
  document.getElementById('execute-backup-btn').textContent = i18n.executeBtn;
  document.getElementById('refresh-diff-btn').textContent = i18n.refreshBtn;
  document.getElementById('apply-selected-btn').textContent = i18n.applyBtn;

  // 全選択ボタンが存在する場合のみラベルを適用
  const selectAllBtn = document.getElementById('select-all-btn');
  if (selectAllBtn) {
    selectAllBtn.textContent = i18n.selectAllBtn || "Select All";
  }

  const titles = document.querySelectorAll('.mode-title');
  const descs = document.querySelectorAll('.mode-desc');
  if (titles[0]) titles[0].textContent = i18n.fullCopyTitle;
  if (descs[0]) descs[0].textContent = i18n.fullCopyDesc;
  if (titles[1]) titles[1].textContent = i18n.archiveTitle;
  if (descs[1]) descs[1].textContent = i18n.archiveDesc;
  if (titles[2]) titles[2].textContent = i18n.diffTitle;
  if (descs[2]) descs[2].textContent = i18n.diffDesc;

  UpdateDisplay();
}

function UpdateDisplay() {
  const fileEl = document.getElementById('selected-workfile');
  const dirEl = document.getElementById('selected-backupdir');
  fileEl.textContent = workFile ? workFile.split(/[\\/]/).pop() : i18n.selectedWorkFile;
  fileEl.title = workFile;
  dirEl.textContent = backupDir ? "Custom Path" : i18n.selectedBackupDir;
  dirEl.title = backupDir || "Default";
}

async function UpdateHistory() {
  const list = document.getElementById('diff-history-list');
  if (!workFile) {
    list.innerHTML = `<div class="info-msg">${i18n.selectFileFirst}</div>`;
    return;
  }

  try {
    const data = await GetDiffList(workFile, backupDir);
    if (!data || data.length === 0) {
      list.innerHTML = `<div class="info-msg">${i18n.noHistory}</div>`;
      return;
    }
    data.sort((a, b) => b.fileName.localeCompare(a.fileName));
    list.innerHTML = data.map(item => `
      <div class="diff-item">
        <label style="display:flex; align-items:center; cursor:pointer; width:100%;">
          <input type="checkbox" class="diff-checkbox" value="${item.filePath}" style="margin-right:10px;">
          <div style="display:flex; flex-direction:column; flex:1; overflow:hidden;">
            <span class="diff-name" title="${item.fileName}" style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.fileName}</span>
            <span class="diff-ts" style="font-size:10px; color:#666;">Time: ${item.timestamp}</span>
          </div>
        </label>
      </div>
    `).join('');
  } catch (err) { console.error(err); }
}

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

document.addEventListener('DOMContentLoaded', () => {
  Initialize();

  // 安全なイベント登録（要素が存在するかチェックしてから登録）
  const selectAllBtn = document.getElementById('select-all-btn');
  if (selectAllBtn) {
    selectAllBtn.onclick = () => {
      const checkboxes = document.querySelectorAll('.diff-checkbox');
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      checkboxes.forEach(cb => cb.checked = !allChecked);
    };
  }

  document.getElementById('workfile-btn').onclick = async () => {
    const res = await SelectAnyFile(i18n.workFileBtn, [{ DisplayName: "Target", Pattern: "*.*" }]);
    if (res) { workFile = res; UpdateDisplay(); UpdateHistory(); }
  };

  document.getElementById('backupdir-btn').onclick = async () => {
    const res = await SelectBackupFolder();
    if (res) { backupDir = res; UpdateDisplay(); UpdateHistory(); }
  };

  document.getElementById('execute-backup-btn').onclick = OnExecute;
  document.getElementById('refresh-diff-btn').onclick = UpdateHistory;

  document.getElementById('apply-selected-btn').onclick = async () => {
    const targets = Array.from(document.querySelectorAll('.diff-checkbox:checked')).map(el => el.value);
    if (targets.length > 0 && confirm(i18n.restoreConfirm)) {
      await ApplyMultiDiff(workFile, targets);
      alert(i18n.diffApplySuccess);
    }
  };

  document.querySelectorAll('input[name="backupMode"]').forEach(radio => {
    radio.onchange = (e) => {
      const isDiff = e.target.value === 'diff';
      const history = document.getElementById('history-section');
      if (history) {
        history.style.opacity = isDiff ? "1" : "0.4";
        history.style.pointerEvents = isDiff ? "auto" : "none";
      }
      if (isDiff) UpdateHistory();
    };
  });
});
