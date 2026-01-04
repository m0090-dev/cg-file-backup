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
  ReadTextFile,
  GetConfigDir,
  GetRestorePreviousState
} from '../wailsjs/go/main/App';

import { OnFileDrop } from "../wailsjs/runtime/runtime";

// ドラッグアンドドロップのデフォルトの処理を全て上書き
const preventDefault = (e) => {
  e.preventDefault();
  e.stopPropagation();
};
// Bug that prevents dragging on Windows
//window.addEventListener('dragover', preventDefault, true);
//window.addEventListener('drop', preventDefault, true);

// Only this
window.addEventListener('dragenter', preventDefault, true);

// --- 状態管理 ---
let i18n = null;
let tabs = [{ id: Date.now(), workFile: '', workFileSize: 0, backupDir: '', active: true }];
let recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
const MAX_RECENT_COUNT = 5;
const SESSION_FILE_NAME = "session.json";

// --- ヘルパー ---
function getActiveTab() { return tabs.find(t => t.active); }

function addToRecentFiles(path) {
  if (!path) return;
  recentFiles = [path, ...recentFiles.filter(p => p !== path)].slice(0, MAX_RECENT_COUNT);
  localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
  renderRecentFiles();
}

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

// --- セッション保存・復元ロジック ---
async function saveCurrentSession() {
  try {
    const shouldRestore = await GetRestorePreviousState();
    if (!shouldRestore) return;
    const configDir = await GetConfigDir();
    const sessionPath = configDir + "/" + SESSION_FILE_NAME;
    const data = JSON.stringify({ tabs, recentFiles });
    await WriteTextFile(sessionPath, data);
  } catch (err) {
    console.error("Save session failed:", err);
  }
}

async function restoreSession() {
  try {
    const shouldRestore = await GetRestorePreviousState();
    if (!shouldRestore) return;
    const configDir = await GetConfigDir();
    const sessionPath = configDir + "/" + SESSION_FILE_NAME;
    const content = await ReadTextFile(sessionPath);
    if (content) {
      const saved = JSON.parse(content);
      if (saved.tabs && saved.tabs.length > 0) { tabs = saved.tabs; }
      if (saved.recentFiles) {
        recentFiles = saved.recentFiles;
        localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
      }
    }
  } catch (err) {
    console.log("No session to restore.");
  }
}

// --- UI描画系 ---
function renderRecentFiles() {
  const list = document.getElementById('recent-list');
  if (!list) return;
  if (recentFiles.length === 0) {
    list.innerHTML = `<span class="recent-empty">No recent files</span>`;
    return;
  }
  list.innerHTML = recentFiles.map(path => {
    const fileName = path.split(/[\\/]/).pop();
    return `<div class="recent-item" title="${path}" data-path="${path}"><i></i> ${fileName}</div>`;
  }).join('');

  list.querySelectorAll('.recent-item').forEach(el => {
    el.onclick = async (e) => {
      e.stopPropagation();
      const path = el.getAttribute('data-path');
      const tab = getActiveTab();
      try {
        tab.workFileSize = await GetFileSize(path);
        tab.workFile = path;
        addToRecentFiles(path);
        renderTabs(); UpdateDisplay(); UpdateHistory();
        saveCurrentSession();
        const popup = document.querySelector('.recent-files-section');
        if (popup) { popup.style.display = 'none'; setTimeout(() => popup.style.removeProperty('display'), 500); }
      } catch (err) {
        recentFiles = recentFiles.filter(p => p !== path);
        localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
        renderRecentFiles();
      }
    };
    el.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      const path = el.getAttribute('data-path');
      recentFiles = recentFiles.filter(p => p !== path);
      localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
      renderRecentFiles();
      saveCurrentSession();
    };
  });
}

function renderTabs() {
  const list = document.getElementById('tabs-list');
  if (!list) return;
  list.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = `tab-item ${tab.active ? 'active' : ''}`;
    const fileName = tab.workFile ? tab.workFile.split(/[\\/]/).pop() : (i18n?.selectedWorkFile || "New Tab");
    el.textContent = fileName;
    el.onclick = () => switchTab(tab.id);
    el.oncontextmenu = (e) => { e.preventDefault(); if (tabs.length > 1) removeTab(tab.id); };
    list.appendChild(el);
  });
}

function switchTab(id) {
  tabs.forEach(t => t.active = (t.id === id));
  renderTabs(); UpdateDisplay(); UpdateHistory();
  saveCurrentSession();
}

function addTab() {
  tabs.forEach(t => t.active = false);
  tabs.push({ id: Date.now(), workFile: '', workFileSize: 0, backupDir: '', active: true });
  renderTabs(); UpdateDisplay(); UpdateHistory();
  saveCurrentSession();
}

function removeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  const wasActive = tabs[index].active;
  tabs.splice(index, 1);
  if (wasActive) tabs[Math.max(0, index - 1)].active = true;
  renderTabs(); UpdateDisplay(); UpdateHistory();
  saveCurrentSession();
}

async function UpdateHistory() {
  const tab = getActiveTab();
  const list = document.getElementById('diff-history-list');
  if (!list || !i18n) return;
  if (!tab?.workFile) { list.innerHTML = `<div class="info-msg">${i18n.selectFileFirst}</div>`; return; }
  try {
    const data = await GetBackupList(tab.workFile, tab.backupDir);
    if (!data || data.length === 0) { list.innerHTML = `<div class="info-msg">${i18n.noHistory}</div>`; return; }
    data.sort((a, b) => b.fileName.localeCompare(a.fileName));
    const itemsHtml = await Promise.all(data.map(async (item) => {
      const note = await ReadTextFile(item.filePath + ".note").catch(() => "");
      return `<div class="diff-item">
          <div style="display:flex; align-items:center; width:100%;">
            <label style="display:flex; align-items:center; cursor:pointer; flex:1; min-width:0;">
              <input type="checkbox" class="diff-checkbox" value="${item.filePath}" style="margin-right:10px;">
              <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <span class="diff-name" title="${item.filePath}" style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  ${item.fileName} <span style="font-size:10px; color:#3B5998;">(${formatSize(item.FileSize)})</span>
                </span>
                <span style="font-size:10px; color:#888;">${item.timestamp}</span>
                ${note ? `<div style="font-size:10px; color:#2f8f5b; font-style:italic; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"> ${note}</div>` : ''}
              </div>
            </label>
            <button class="note-btn" data-path="${item.filePath}" style="background:none; border:none; cursor:pointer; font-size:14px; padding:4px;"></button>
          </div>
        </div>`;
    }));
    list.innerHTML = itemsHtml.join('');
  } catch (err) { list.innerHTML = `<div class="info-msg" style="color:red;">Error loading history</div>`; }
}

async function Initialize() {
  const data = await GetI18N();
  if (!data) return;
  i18n = data;
  await restoreSession();
  const setText = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text || ""; };
  const setQueryText = (sel, text) => { const el = document.querySelector(sel); if (el) el.textContent = text || ""; };

  setQueryText('.action-section h3', i18n.newBackupTitle);
  setQueryText('.history-section h3', i18n.historyTitle);
  setText('workfile-btn', i18n.workFileBtn);
  setText('backupdir-btn', i18n.backupDirBtn);

  const titles = document.querySelectorAll('.mode-title');
  const descs = document.querySelectorAll('.mode-desc');
  if (titles.length >= 3) {
    titles[0].textContent = i18n.fullCopyTitle; descs[0].textContent = i18n.fullCopyDesc;
    titles[1].textContent = i18n.archiveTitle; descs[1].textContent = i18n.archiveDesc;
    titles[2].textContent = i18n.diffTitle; descs[2].textContent = i18n.diffDesc;
  }

  setText('execute-backup-btn', i18n.executeBtn);
  setText('refresh-diff-btn', i18n.refreshBtn);
  setText('apply-selected-btn', i18n.applyBtn);
  setText('select-all-btn', i18n.selectAllBtn);
  setText('drop-modal-title', i18n.dropModalTitle);
  setText('drop-set-workfile', i18n.dropSetWorkFile);
  setText('drop-set-backupdir', i18n.dropSetBackupDir);
  setText('drop-cancel', i18n.dropCancel);

  // Compact用テキスト
  setQueryText('.compact-title-text', i18n.compactMode || "Compact");
  setText('compact-workfile-btn', i18n.workFileBtn);
  setText('compact-execute-btn', i18n.executeBtn);
  const cSel = document.getElementById('compact-mode-select');
  if (cSel && cSel.options.length >= 3) {
    cSel.options[0].text = i18n.fullCopyTitle;
    cSel.options[1].text = i18n.archiveTitle;
    cSel.options[2].text = i18n.diffTitle;
  }

  const workBtn = document.getElementById('workfile-btn');
  const recentSec = document.querySelector('.recent-files-section');
  if (workBtn && recentSec) {
    workBtn.addEventListener('mouseenter', () => { recentSec.style.display = 'block'; setTimeout(() => recentSec.style.opacity = '1', 10); });
    workBtn.addEventListener('mouseleave', () => { setTimeout(() => { if (!recentSec.matches(':hover')) { recentSec.style.display = 'none'; recentSec.style.opacity = '0'; } }, 300); });
    recentSec.addEventListener('mouseleave', () => { recentSec.style.display = 'none'; recentSec.style.opacity = '0'; });
  }

  setupDragAndDrop();
  renderTabs(); renderRecentFiles(); UpdateDisplay(); UpdateHistory();
}

function UpdateDisplay() {
  const tab = getActiveTab();
  if (!i18n || !tab) return;
  const fileEl = document.getElementById('selected-workfile');
  const dirEl = document.getElementById('selected-backupdir');
  if (fileEl) fileEl.textContent = (tab.workFile ? tab.workFile.split(/[\\/]/).pop() : i18n.selectedWorkFile) + (tab.workFile ? ` [${formatSize(tab.workFileSize)}]` : "");
  if (dirEl) dirEl.textContent = tab.backupDir || i18n.selectedBackupDir;

  const mode = document.querySelector('input[name="backupMode"]:checked')?.value;
  const isPass = (mode === 'archive' && document.getElementById('archive-format')?.value === 'zip-pass');
  const pwdArea = document.querySelector('.password-wrapper');
  if (pwdArea) { pwdArea.style.opacity = isPass ? "1" : "0.3"; document.getElementById('archive-password').disabled = !isPass; }

  // Compact同期
  const cFileEl = document.getElementById('compact-selected-file');
  if (cFileEl) cFileEl.textContent = tab.workFile ? tab.workFile.split(/[\\/]/).pop() : (i18n.selectedWorkFile || "No File Selected");
  const cSel = document.getElementById('compact-mode-select');
  if (cSel && mode) cSel.value = mode;
}


function setupDragAndDrop() {
  // 第2引数の true は「Wailsのネイティブドロップを優先する」設定です
  OnFileDrop((x, y, paths) => {
    // 1. 即座にガード（タイムアウトなし）
    if (!paths || paths.length === 0) return;

    const droppedPath = paths[0];
    const modal = document.getElementById('drop-modal');
    const pathText = document.getElementById('drop-modal-path');

    // 2. 同期的に判定処理を開始（awaitが必要な処理だけasyncで回す）
    (async () => {
      let isDir = false;
      try {
        const size = await GetFileSize(droppedPath);
        // Wails/Go側でフォルダの場合に-1や特定の値を返す設計に合わせる
        if (size === undefined || size < 0) isDir = true;
      } catch (e) {
        isDir = true; 
      }

      // 3. UI表示
      pathText.textContent = droppedPath;
      modal.classList.remove('hidden');

      // 4. ボタンイベントの再割り当て（古いリスナーを消すため、毎回上書き）
      document.getElementById('drop-set-workfile').onclick = async () => {
        if (isDir) {
          alert(i18n.dropErrorFolderAsFile || "フォルダはファイルとして設定できません");
          return;
        }
        const tab = getActiveTab();
        tab.workFile = droppedPath;
        tab.workFileSize = await GetFileSize(droppedPath);
        addToRecentFiles(droppedPath);
        finishDrop(i18n.updatedWorkFile);
      };

      document.getElementById('drop-set-backupdir').onclick = () => {
        if (!isDir) {
          alert(i18n.dropErrorFileAsFolder || "ファイルはフォルダとして設定できません");
          return;
        }
        const tab = getActiveTab();
        tab.backupDir = droppedPath;
        finishDrop(i18n.updatedBackupDir);
      };

      document.getElementById('drop-cancel').onclick = () => {
        modal.classList.add('hidden');
      };

      function finishDrop(msg) {
        modal.classList.add('hidden');
        showFloatingMessage(msg);
        renderTabs(); 
        UpdateDisplay(); 
        UpdateHistory();
        saveCurrentSession();
      }
    })(); 
  }, true);
}


function toggleProgress(show, text = "") {
  const displayMsg = text || (i18n ? i18n.processingMsg : "Processing...");
  const container = document.getElementById('progress-container');
  const bar = document.getElementById('progress-bar');
  const status = document.getElementById('progress-status');
  const btn = document.getElementById('execute-backup-btn');
  const cBar = document.getElementById('compact-progress-bar');
  const cSts = document.getElementById('compact-status-label');
  const cBtn = document.getElementById('compact-execute-btn');

  if (show) {
    if (container) container.style.display = 'block';
    if (status) { status.style.display = 'block'; status.textContent = displayMsg; }
    if (bar) bar.style.width = '0%';
    if (btn) btn.disabled = true;
    if (cSts) cSts.textContent = displayMsg;
    if (cBar) cBar.style.width = '0%';
    if (cBtn) cBtn.disabled = true;
  } else {
    if (bar) bar.style.width = '100%';
    if (cBar) cBar.style.width = '100%';
    setTimeout(() => {
      if (container) container.style.display = 'none';
      if (status) status.style.display = 'none';
      if (btn) btn.disabled = false;
      if (cSts) cSts.textContent = "Ready";
      if (cBar) cBar.style.width = '0%';
      if (cBtn) cBtn.disabled = false;
    }, 500);
  }
}

async function OnExecute() {
  const tab = getActiveTab();
  if (!tab?.workFile) { alert(i18n.selectFileFirst); return; }
  let mode = document.querySelector('input[name="backupMode"]:checked')?.value;
  if (document.body.classList.contains('compact-mode')) {
    mode = document.getElementById('compact-mode-select').value;
  }
  toggleProgress(true, i18n.processingMsg);
  try {
    let successText = "";
    if (mode === 'copy') { await CopyBackupFile(tab.workFile, tab.backupDir); successText = i18n.copyBackupSuccess; }
    else if (mode === 'archive') {
      let fmt = document.getElementById('archive-format').value;
      let pwd = (fmt === "zip-pass") ? document.getElementById('archive-password').value : "";
      if (fmt === "zip-pass") fmt = "zip";
      await ArchiveBackupFile(tab.workFile, tab.backupDir, fmt, pwd);
      successText = i18n.archiveBackupSuccess.replace('{format}', fmt.toUpperCase());
    } else if (mode === 'diff') {
      const algo = document.getElementById('diff-algo').value;
      await BackupOrDiff(tab.workFile, tab.backupDir, algo);
      successText = `${i18n.diffBackupSuccess} (${algo.toUpperCase()})`;
    }
    toggleProgress(false); showFloatingMessage(successText); UpdateHistory();
  } catch (err) { toggleProgress(false); alert(err); }
}

document.addEventListener('DOMContentLoaded', Initialize);

window.addEventListener('click', async (e) => {
  const id = e.target.id;
  const tab = getActiveTab();
  if (id === 'add-tab-btn') { addTab(); return; }
  const noteBtn = e.target.closest('.note-btn');
  if (noteBtn) {
    const path = noteBtn.getAttribute('data-path');
    const cur = await ReadTextFile(path + ".note").catch(() => "");
    const val = prompt("Memo:", cur);
    if (val !== null) { await WriteTextFile(path + ".note", val); UpdateHistory(); }
    return;
  }
  if (id === 'workfile-btn' || id === 'compact-workfile-btn') {
    const res = await SelectAnyFile(i18n.workFileBtn, [{ DisplayName: "Work file", Pattern: "*.*" }]);
    if (res) {
      tab.workFile = res;
      tab.workFileSize = await GetFileSize(res);
      addToRecentFiles(res);
      renderTabs(); UpdateDisplay(); UpdateHistory();
      saveCurrentSession();
    }
  } else if (id === 'backupdir-btn') {
    const res = await SelectBackupFolder();
    if (res) {
      tab.backupDir = res;
      UpdateDisplay(); UpdateHistory();
      saveCurrentSession();
    }
  } else if (id === 'execute-backup-btn' || id === 'compact-execute-btn') {
    OnExecute();
  } else if (id === 'refresh-diff-btn') {
    UpdateHistory();
  } else if (id === 'select-all-btn') {
    const cbs = document.querySelectorAll('.diff-checkbox');
    const all = Array.from(cbs).every(cb => cb.checked);
    cbs.forEach(cb => cb.checked = !all);
  } else if (id === 'apply-selected-btn') {
    const targets = Array.from(document.querySelectorAll('.diff-checkbox:checked')).map(el => el.value);
    if (targets.length > 0 && confirm(i18n.restoreConfirm)) {
      toggleProgress(true, "Restoring...");
      try { for (const p of targets) { await RestoreBackup(p, tab.workFile); } toggleProgress(false); showFloatingMessage(i18n.diffApplySuccess); UpdateHistory(); }
      catch (err) { toggleProgress(false); alert(err); }
    }
  }
});

document.addEventListener('change', (e) => {
  if (['backupMode', 'archive-format'].includes(e.target.name) || e.target.id === 'archive-format') UpdateDisplay();
  if (e.target.id === 'compact-mode-select') {
    const radio = document.querySelector(`input[name="backupMode"][value="${e.target.value}"]`);
    if (radio) { radio.checked = true; UpdateDisplay(); }
  }
});

window.runtime.EventsOn("compact-mode-event", (isCompact) => {
  const view = document.getElementById("compact-view");
  if (isCompact) {
    document.body.classList.add("compact-mode");
    if (view) view.classList.remove("hidden");
    UpdateDisplay();
  } else {
    document.body.classList.remove("compact-mode");
    if (view) view.classList.add("hidden");
  }
});
