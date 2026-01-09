import {
  SelectAnyFile,
  SelectBackupFolder,
  GetFileSize,
  WriteTextFile,
  ReadTextFile,
  RestoreBackup
} from '../wailsjs/go/main/App';

import {
  i18n,
  getActiveTab,
  addToRecentFiles,
  saveCurrentSession
} from './state';

import {
  renderTabs,
  UpdateDisplay,
  UpdateHistory,
  toggleProgress,
  showFloatingMessage
} from './ui';

import {
  addTab,
  OnExecute,
} from './actions';

// --- ドラッグアンドドロップの基本防止設定 ---
const preventDefault = (e) => {
  e.preventDefault();
  e.stopPropagation();
};

export function setupGlobalEvents() {
  // Only this
  window.addEventListener('dragenter', preventDefault, true);

  // --- クリックイベントリスナー ---
  window.addEventListener('click', async (e) => {
    const id = e.target.id;
    const tab = getActiveTab();
    
    if (id === 'add-tab-btn') { 
      addTab(); 
      return; 
    }

    const noteBtn = e.target.closest('.note-btn');
    if (noteBtn) {
      const path = noteBtn.getAttribute('data-path');
      const cur = await ReadTextFile(path + ".note").catch(() => "");
      const val = prompt("Memo:", cur);
      if (val !== null) { 
        await WriteTextFile(path + ".note", val); 
        UpdateHistory(); 
      }
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
        showFloatingMessage(i18n.updatedWorkFile);
      }
    } else if (id === 'backupdir-btn') {
      const res = await SelectBackupFolder();
      if (res) {
        tab.backupDir = res;
        UpdateDisplay(); UpdateHistory();
        saveCurrentSession();
	showFloatingMessage(i18n.updatedBackupDir);
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
        try { 
          for (const p of targets) { await RestoreBackup(p, tab.workFile); } 
          toggleProgress(false); 
          showFloatingMessage(i18n.diffApplySuccess); 
          UpdateHistory(); 
        }
        catch (err) { toggleProgress(false); alert(err); }
      }
    }
  });

  // --- 変更イベントリスナー ---
  document.addEventListener('change', (e) => {
    const id = e.target.id;
    const name = e.target.name;
    const value = e.target.value;
    if (['backupMode', 'archive-format'].includes(e.target.name) || id === 'archive-format') {
      UpdateDisplay();

    }
    if (['backupMode', 'archive-format'].includes(name) || id === 'archive-format' || id === 'diff-algo') {
      UpdateDisplay();
      updateExecute();
    }
    if (id === 'compact-mode-select') {
      const radio = document.querySelector(`input[name="backupMode"][value="${value}"]`);
      if (radio) { 
        radio.checked = true; 
        UpdateDisplay(); 
	updateExecute();
      }
    }
  });

  // --- Wails Runtime Events ---
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
}
