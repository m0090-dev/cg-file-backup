import {
  SelectAnyFile,
  SelectBackupFolder,
  CopyBackupFile,
  ArchiveBackupFile,
  GetI18N,
  BackupOrDiff,
  GetBackupList,
  RestoreBackup,
  GetFileSize,
  WriteTextFile,
  ReadTextFile
} from '../wailsjs/go/main/App';

import { OnFileDrop } from "../wailsjs/runtime/runtime";

let i18n = null;
let workFile = '';
let workFileSize = 0;
let backupDir = '';

const MAX_BSDIFF_SIZE = 100 * 1024 * 1024; // 100MB

// --- ユーティリティ ---
function formatSize(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function showFloatingMessage(text) {
  const msgArea = document.getElementById('message-area');
  if (!msgArea) return;
  msgArea.textContent = text;
  msgArea.classList.remove('hidden');
  setTimeout(() => msgArea.classList.add('hidden'), 3000);
}
// --- ドラッグアンドドロップの実装 ---
function setupDragAndDrop() {
    const preventDefaults = (e) => { e.preventDefault(); e.stopPropagation(); };
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(name => window.addEventListener(name, preventDefaults, false));

    const modal = document.getElementById('drop-modal');
    const pathText = document.getElementById('drop-modal-path');
    
    OnFileDrop((x, y, paths) => {
        if (!paths || paths.length === 0) return;
        const droppedPath = paths[0];

        setTimeout(async () => {
            let isDirectory = false;
            try {
                // GetFileSizeがエラーを投げるか、特定の値を返すかで判定
                const size = await GetFileSize(droppedPath);
                // Go側の実装に依存しますが、一般的にフォルダはサイズ取得でエラーか負の値を返します
                if (size === undefined || size < 0) isDirectory = true;
            } catch (e) {
                isDirectory = true;
            }

            // モーダルを表示
            pathText.textContent = droppedPath;
            modal.classList.remove('hidden');

            // --- ボタンのクリックイベント設定 ---
            
            // 「作業ファイルに設定」ボタン
            document.getElementById('drop-set-workfile').onclick = async () => {
                if (isDirectory) {
                    alert(i18n.dropErrorFolderAsFile);
                    return;
                }
                workFile = droppedPath;
                workFileSize = await GetFileSize(droppedPath);
                finishDrop(i18n.updatedWorkFile);
            };

            // 「保存先フォルダに設定」ボタン
            document.getElementById('drop-set-backupdir').onclick = () => {
                if (!isDirectory) {
                    alert(i18n.dropErrorFileAsFolder);
                    return;
                }
                backupDir = droppedPath;
                finishDrop(i18n.updatedBackupDir);
            };

            document.getElementById('drop-cancel').onclick = () => modal.classList.add('hidden');

            function finishDrop(msg) {
                modal.classList.add('hidden');
                showFloatingMessage(msg);
                UpdateDisplay();
                UpdateHistory();
            }
        }, 200);
    }, true);
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
    container.offsetHeight; 

    if (btn) btn.disabled = true;

    let width = 0;
    const interval = setInterval(() => {
      if (width >= 90) {
        clearInterval(interval);
      } else {
        width += (95 - width) * 0.1;
        bar.style.width = width + '%';
      }
    }, 200);
    return interval;
  } else {
    if (bar) bar.style.width = '100%';
    setTimeout(() => {
      container.style.display = 'none';
      status.style.display = 'none';
      if (btn) btn.disabled = false;
    }, 500);
    return null;
  }
}

// --- 初期化 (完全版) ---
async function Initialize() {
  const data = await GetI18N();
  if (!data) return;
  i18n = data;

  // テキスト更新用のヘルパー
  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };
  const setQueryText = (sel, text) => {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  };

  // メイン画面のテキスト設定
  setQueryText('.action-section h3', i18n.newBackupTitle);
  setQueryText('.history-section h3', i18n.historyTitle);
  setText('workfile-btn', i18n.workFileBtn);
  setText('backupdir-btn', i18n.backupDirBtn);
  setText('execute-backup-btn', i18n.executeBtn);
  setText('refresh-diff-btn', i18n.refreshBtn);
  setText('apply-selected-btn', i18n.applyBtn);
  setText('select-all-btn', i18n.selectAllBtn);

  // バックアップモードのタイトルと説明
  const titles = document.querySelectorAll('.mode-title');
  const descs = document.querySelectorAll('.mode-desc');
  if (titles.length >= 3) {
    titles[0].textContent = i18n.fullCopyTitle; descs[0].textContent = i18n.fullCopyDesc;
    titles[1].textContent = i18n.archiveTitle; descs[1].textContent = i18n.archiveDesc;
    titles[2].textContent = i18n.diffTitle; descs[2].textContent = i18n.diffDesc;
  }

  // --- ドロップモーダルの多言語化設定 ---
  setText('drop-modal-title', i18n.dropModalTitle);
  // 説明文（path表示の下にある指示文）を取得して設定
  const dropInstruction = document.querySelector('#drop-modal p:not(.path-display)');
  if (dropInstruction) {
    dropInstruction.textContent = i18n.dropSelectTarget;
  }
  setText('drop-set-workfile', i18n.dropSetWorkFile);
  setText('drop-set-backupdir', i18n.dropSetBackupDir);
  setText('drop-cancel', i18n.dropCancel);

  // 初回表示の更新
  UpdateDisplay();
  UpdateHistory();
  
  // ドラッグ＆ドロップイベントの有効化
  setupDragAndDrop();
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
    dirEl.textContent = backupDir ? backupDir : i18n.selectedBackupDir;
  }

  const selectedMode = document.querySelector('input[name="backupMode"]:checked')?.value || 'copy';
  const archiveFmt = document.getElementById('archive-format')?.value;
  const pwdInput = document.getElementById('archive-password');
  const pwdArea = document.querySelector('.password-wrapper');
  if (pwdInput && pwdArea) {
    const isPassMode = (selectedMode === 'archive' && archiveFmt === 'zip-pass');
    pwdInput.disabled = !isPassMode;
    pwdArea.style.opacity = isPassMode ? "1" : "0.3";
  }

  const diffRadio = document.querySelector('input[value="diff"]');
  const selectedAlgo = document.getElementById('diff-algo')?.value || 'hdiff';
  const shouldDisableDiff = (selectedAlgo === 'bsdiff' && workFileSize > MAX_BSDIFF_SIZE);

  if (diffRadio) {
    diffRadio.disabled = shouldDisableDiff;
    if (shouldDisableDiff && diffRadio.checked) {
      document.querySelector('input[value="copy"]').checked = true;
      UpdateDisplay();
    }
  }
}

// --- 履歴リストの更新 ---
async function UpdateHistory() {
  if (!i18n) return;
  const list = document.getElementById('diff-history-list');
  if (!list) return;

  if (!workFile) {
    list.innerHTML = `<div class="info-msg">${i18n.selectFileFirst}</div>`;
    return;
  }

  try {
    const data = await GetBackupList(workFile, backupDir);
    if (!data || data.length === 0) {
      list.innerHTML = `<div class="info-msg">${i18n.noHistory}</div>`;
      return;
    }

    data.sort((a, b) => b.fileName.localeCompare(a.fileName));

    const itemsHtml = await Promise.all(data.map(async (item) => {
      const note = await ReadTextFile(item.filePath + ".note").catch(() => "");
      const tooltip = note ? `${item.filePath}\n\n[MEMO]\n${note}` : item.filePath;

      return `
        <div class="diff-item">
          <div style="display:flex; align-items:center; width:100%;">
            <label style="display:flex; align-items:center; cursor:pointer; flex:1; min-width:0;">
              <input type="checkbox" class="diff-checkbox" value="${item.filePath}" style="margin-right:10px; flex-shrink:0;">
              <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <span class="diff-name" title="${tooltip}" style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                    ${item.fileName} <span style="font-size:10px; color:#0078d4;">(${formatSize(item.FileSize)})</span>
                </span>
                <span style="font-size:10px; color:#666;">${item.timestamp}</span>
                ${note ? `<div class="note-text" style="font-size:10px; color:#2f8f5b; margin-top:2px; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"> ${note}</div>` : ''}
              </div>
            </label>
            <button class="note-btn" data-path="${item.filePath}" style="margin-left:8px; background:none; border:none; cursor:pointer; font-size:14px; padding:4px;" title="Edit Memo"></button>
          </div>
        </div>
      `;
    }));

    list.innerHTML = itemsHtml.join('');
  } catch (err) {
    console.error(err);
  }
}

// --- バックアップ実行 ---
async function OnExecute() {
  if (!workFile) { alert(i18n.selectFileFirst); return; }
  const mode = document.querySelector('input[name="backupMode"]:checked').value;
  const timer = toggleProgress(true, i18n.processingMsg || "Processing...");
  await new Promise(resolve => setTimeout(resolve, 100));

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
    showFloatingMessage(successText);
    UpdateHistory();
  } catch (err) {
    if (timer) clearInterval(timer);
    toggleProgress(false);
    alert(err);
  }
}

// --- イベントリスナー設定 ---
document.addEventListener('DOMContentLoaded', Initialize);

window.addEventListener('click', async (e) => {
  if (!i18n) return;
  const id = e.target.id;
  const target = e.target;
  const noteBtn = target.closest('.note-btn');

  if (noteBtn) {
    const filePath = noteBtn.getAttribute('data-path');
    const currentNote = await ReadTextFile(filePath + ".note").catch(() => "");
    const newNote = prompt("Memo / Annotation:", currentNote);
    if (newNote !== null) {
      try {
        await WriteTextFile(filePath + ".note", newNote);
        UpdateHistory();
      } catch (err) {
        alert("Failed to save memo: " + err);
      }
    }
    return;
  }

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
        for (const path of targets) {
          await RestoreBackup(path, workFile);
        }
        if (timer) clearInterval(timer);
        toggleProgress(false);
        showFloatingMessage(i18n.diffApplySuccess);
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
  }
});
