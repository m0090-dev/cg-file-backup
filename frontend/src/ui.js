import { 
    i18n, 
    tabs, 
    recentFiles, 
    getActiveTab, 
    formatSize,
    saveCurrentSession,
    addToRecentFiles
} from './state';

import { 
    GetBackupList, 
    ReadTextFile, 
    GetFileSize 
} from '../wailsjs/go/main/App';

import { switchTab, removeTab,updateExecute } from './actions';


// UI描画・メッセージ系
export function showFloatingMessage(text) {
  const msgArea = document.getElementById('message-area');
  if (!msgArea) return;
  msgArea.textContent = text;
  msgArea.classList.remove('hidden');
  setTimeout(() => msgArea.classList.add('hidden'), 3000);
}

export function renderRecentFiles() {
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
        renderRecentFiles(); // state側で呼べないためここで実行
        renderTabs(); UpdateDisplay(); UpdateHistory();
        saveCurrentSession();
        const popup = document.querySelector('.recent-files-section');
        if (popup) { popup.style.display = 'none'; setTimeout(() => popup.style.removeProperty('display'), 500); }
      } catch (err) {
        // recentFilesはstateの参照を直接操作
        const idx = recentFiles.indexOf(path);
        if (idx > -1) recentFiles.splice(idx, 1);
        localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
        renderRecentFiles();
      }
    };
    el.oncontextmenu = (e) => {
      e.preventDefault(); e.stopPropagation();
      const path = el.getAttribute('data-path');
      const idx = recentFiles.indexOf(path);
      if (idx > -1) recentFiles.splice(idx, 1);
      localStorage.setItem('recentFiles', JSON.stringify(recentFiles));
      renderRecentFiles();
      saveCurrentSession();
    };
  });
}
export function renderTabs() {
  const list = document.getElementById('tabs-list');
  if (!list) return;
  list.innerHTML = '';
  tabs.forEach(tab => {
    const el = document.createElement('div');
    el.className = `tab-item ${tab.active ? 'active' : ''}`;
    const fileName = tab.workFile ? tab.workFile.split(/[\\/]/).pop() : (i18n?.selectedWorkFile || "New Tab");
    el.textContent = fileName;

    // --- 修正: dispatchEvent ではなく actions の関数を直接呼ぶ ---
    el.onclick = () => switchTab(tab.id); 
    el.oncontextmenu = (e) => { 
      e.preventDefault(); 
      if (tabs.length > 1) removeTab(tab.id); 
    };
    
    list.appendChild(el);
  });
}


export function UpdateDisplay() {
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
  updateExecute()

  // Compact同期
  const cFileEl = document.getElementById('compact-selected-file');
  if (cFileEl) cFileEl.textContent = tab.workFile ? tab.workFile.split(/[\\/]/).pop() : (i18n.selectedWorkFile || "No File Selected");
  const cSel = document.getElementById('compact-mode-select');
  if (cSel && mode) cSel.value = mode;
}

export async function UpdateHistory() {
  const tab = getActiveTab();
  const list = document.getElementById('diff-history-list');
  if (!list || !i18n) return;
  if (!tab?.workFile) { 
    list.innerHTML = `<div class="info-msg">${i18n.selectFileFirst}</div>`; 
    return; 
  }
  
  try {
    const data = await GetBackupList(tab.workFile, tab.backupDir);
    if (!data || data.length === 0) { 
      list.innerHTML = `<div class="info-msg">${i18n.noHistory}</div>`; 
      return; 
    }
    
    // ファイル名でソート（既存維持）
    data.sort((a, b) => b.fileName.localeCompare(a.fileName));
    
    const itemsHtml = await Promise.all(data.map(async (item) => {
      const note = await ReadTextFile(item.filePath + ".note").catch(() => "");
      
      // --- 世代・整合性情報の組み立て ---
      const isArchive = item.generation === 0;
      let statusHtml = "";
      let genBadge = "";

      if (isArchive) {
        // ルート直下のアーカイブ用表示
        const archiveText = i18n.fullArchive || "📦 Full Archive (独立復元可能)";
        statusHtml = `<div style="color:#2f8f5b; font-weight:bold;">${archiveText}</div>`;
        genBadge = `<span style="font-size:10px; color:#fff; background:#2f8f5b; padding:1px 4px; border-radius:3px; margin-left:5px;">Archive</span>`;
      } else {
        // baseN フォルダ内の差分ファイル用表示
        let statusColor = "#e74c3c"; // Default: Red
        let statusIcon = "⚠️";
        let statusText = "";

        // 1. まずチェックサムファイルの有無を確認
        if (item.foundCheckSumFile === false) {
          statusColor = "#f39c12"; // Orange: Warning for missing meta
          statusIcon = "❓";
          statusText = i18n.noChecksum || "整合性不明 (設定ファイル紛失)";
        } 
        // 2. チェックサムはあるが、中身が不整合な場合
        else if (!item.isCompatible) {
          statusColor = "#e74c3c"; // Red: Error for mismatch
          statusIcon = "⚠️";
          statusText = i18n.genMismatch || "世代が異なります (Base不一致)";
        } 
        // 3. すべてクリア（整合性あり）
        else {
          statusColor = "#2f8f5b"; // Green: OK
          statusIcon = "✅";
          statusText = i18n.compatible || "互換性あり";
        }
        
        const genLabel = i18n.generationLabel || "Generation";
        
        statusHtml = `<div style="color:${statusColor}; font-weight:bold;">${statusIcon} ${statusText}</div>
                      <div style="font-size:11px; color:#666;">${genLabel}: ${item.generation}</div>`;
        
        genBadge = `<span style="font-size:10px; color:#fff; background:${statusColor}; padding:1px 4px; border-radius:3px; margin-left:5px;">Gen.${item.generation}</span>`;
      }

      // ポップアップ内に表示するHTML
      const popupContent = `
        ${statusHtml}
        <hr style="border:0; border-top:1px solid #eee; margin:5px 0;">
        <strong>Path:</strong> ${item.filePath}
        ${note ? `<br><hr style="border:0; border-top:1px dashed #ccc; margin:5px 0;"><strong>Memo:</strong> ${note}` : ""}
      `;
      
      return `<div class="diff-item">
          <div style="display:flex; align-items:center; width:100%;">
            <label style="display:flex; align-items:center; cursor:pointer; flex:1; min-width:0;">
              <input type="checkbox" class="diff-checkbox" value="${item.filePath}" style="margin-right:10px;">
              <div style="display:flex; flex-direction:column; flex:1; min-width:0;">
                <span class="diff-name" data-hover-content="${encodeURIComponent(popupContent)}" style="font-weight:bold; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                  ${item.fileName} ${genBadge} <span style="font-size:10px; color:#3B5998;">(${formatSize(item.FileSize)})</span>
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

    // ポップアップイベントの登録
    setupHistoryPopups();

  } catch (err) { 
    console.error(err);
    list.innerHTML = `<div class="info-msg" style="color:red;">Error: ${err.message || 'loading history'}</div>`; 
  }
}



function setupHistoryPopups() {
  const tooltip = document.getElementById('custom-tooltip') || createTooltipElement();
  const targets = document.querySelectorAll('.diff-name');

  targets.forEach(target => {
    target.onmouseenter = (e) => {
      const content = decodeURIComponent(target.getAttribute('data-hover-content'));
      tooltip.innerHTML = content;
      tooltip.classList.remove('hidden');
      
      // 位置計算
      const rect = target.getBoundingClientRect();
      tooltip.style.left = `${rect.left}px`;
      tooltip.style.top = `${rect.bottom + 5}px`;
    };

    target.onmouseleave = () => {
      tooltip.classList.add('hidden');
    };
  });
}

function createTooltipElement() {
  const el = document.createElement('div');
  el.id = 'custom-tooltip';
  el.className = 'custom-tooltip hidden';
  document.body.appendChild(el);
  return el;
}



export function toggleProgress(show, text = "") {
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
