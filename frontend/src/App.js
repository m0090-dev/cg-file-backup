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

// --- 状態管理 ---
let i18n = null;
let tabs = [{ id: Date.now(), workFile: '', workFileSize: 0, backupDir: '', active: true }];
let recentFiles = JSON.parse(localStorage.getItem('recentFiles') || '[]');
const MAX_RECENT_COUNT = 5;

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
    return `<div class="recent-item" title="${path}" data-path="${path}">
              <i></i> ${fileName}
            </div>`;
  }).join('');

  list.querySelectorAll('.recent-item').forEach(el => {
    // 左クリック：ファイルを選択
    el.onclick = async (e) => {
      e.stopPropagation();
      const path = el.getAttribute('data-path');
      const tab = getActiveTab();
      try {
        tab.workFileSize = await GetFileSize(path);
        tab.workFile = path;
        addToRecentFiles(path);
        renderTabs(); UpdateDisplay(); UpdateHistory();
        const popup = document.querySelector('.recent-files-section');
        if (popup) { popup.style.display = 'none'; setTimeout(() => popup.style.removeProperty('display'), 500); }
      } catch (err) {
        recentFiles = recentFiles.filter(p => p !== path);
        localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
        renderRecentFiles();
      }
    };

    // 右クリック：リストから削除 (追加部分)
    el.oncontextmenu = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const path = el.getAttribute('data-path');
      recentFiles = recentFiles.filter(p => p !== path);
      localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
      renderRecentFiles();
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
}

function addTab() {
  tabs.forEach(t => t.active = false);
  tabs.push({ id: Date.now(), workFile: '', workFileSize: 0, backupDir: '', active: true });
  renderTabs(); UpdateDisplay(); UpdateHistory();
}

function removeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  const wasActive = tabs[index].active;
  tabs.splice(index, 1);
  if (wasActive) tabs[Math.max(0, index - 1)].active = true;
  renderTabs(); UpdateDisplay(); UpdateHistory();
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
      return `
        <div class="diff-item">
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

  // ホバーポップアップの制御
  const workBtn = document.getElementById('workfile-btn');
  const recentSec = document.querySelector('.recent-files-section');
  if (workBtn && recentSec) {
    workBtn.addEventListener('mouseenter', () => { recentSec.style.display = 'block'; setTimeout(() => recentSec.style.opacity = '1', 10); });
    workBtn.addEventListener('mouseleave', () => { setTimeout(() => { if (!recentSec.matches(':hover')) { recentSec.style.display = 'none'; recentSec.style.opacity = '0'; } }, 300); });
    recentSec.addEventListener('mouseleave', () => { recentSec.style.display = 'none'; recentSec.style.opacity = '0'; });
  }

  setupDragAndDrop(); // Initialize内で確実に呼ぶ
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
}

function setupDragAndDrop() {
  // OnFileDropは1回だけ登録
  OnFileDrop((x, y, paths) => {
    if (!paths || paths.length === 0) return;
    const droppedPath = paths[0];
    const modal = document.getElementById('drop-modal');
    const pathText = document.getElementById('drop-modal-path');

    setTimeout(async () => {
      let isDir = false;
      try {
        const size = await GetFileSize(droppedPath);
        if (size === undefined || size < 0) isDir = true;
      } catch (e) { isDir = true; }

      pathText.textContent = droppedPath;
      modal.classList.remove('hidden');

      document.getElementById('drop-set-workfile').onclick = async () => {
        if (isDir) { alert(i18n.dropErrorFolderAsFile); return; }
        const tab = getActiveTab();
        tab.workFile = droppedPath;
        tab.workFileSize = await GetFileSize(droppedPath);
        addToRecentFiles(droppedPath);
        finishDrop(i18n.updatedWorkFile);
      };

      document.getElementById('drop-set-backupdir').onclick = () => {
        if (!isDir) { alert(i18n.dropErrorFileAsFolder); return; }
        const tab = getActiveTab();
        tab.backupDir = droppedPath;
        finishDrop(i18n.updatedBackupDir);
      };

      document.getElementById('drop-cancel').onclick = () => modal.classList.add('hidden');

      function finishDrop(msg) {
        modal.classList.add('hidden');
        showFloatingMessage(msg);
        renderTabs(); UpdateDisplay(); UpdateHistory();
      }
    }, 200);
  }, true);
}

function toggleProgress(show, text = "Processing...") {
  const container = document.getElementById('progress-container');
  const bar = document.getElementById('progress-bar');
  const status = document.getElementById('progress-status');
  const btn = document.getElementById('execute-backup-btn');
  if (show) {
    container.style.display = 'block'; status.style.display = 'block';
    status.textContent = text; bar.style.width = '0%';
    if (btn) btn.disabled = true;
  } else {
    if (bar) bar.style.width = '100%';
    setTimeout(() => { container.style.display = 'none'; status.style.display = 'none'; if (btn) btn.disabled = false; }, 500);
  }
}

async function OnExecute() {
  const tab = getActiveTab();
  if (!tab?.workFile) { alert(i18n.selectFileFirst); return; }
  const mode = document.querySelector('input[name="backupMode"]:checked').value;
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
  if (id === 'workfile-btn') {
    const res = await SelectAnyFile(i18n.workFileBtn, [{ DisplayName: "Target", Pattern: "*.*" }]);
    if (res) { tab.workFile = res; tab.workFileSize = await GetFileSize(res); addToRecentFiles(res); renderTabs(); UpdateDisplay(); UpdateHistory(); }
  } else if (id === 'backupdir-btn') {
    const res = await SelectBackupFolder();
    if (res) { tab.backupDir = res; UpdateDisplay(); UpdateHistory(); }
  } else if (id === 'execute-backup-btn') { OnExecute(); }
  else if (id === 'refresh-diff-btn') { UpdateHistory(); }
  else if (id === 'select-all-btn') {
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
});
