import {
  CopyBackupFile,
  ArchiveBackupFile,
  BackupOrDiff,
  RestoreBackup,
  GetFileSize
} from '../wailsjs/go/main/App';

import {
  i18n,
  tabs,
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

// --- タブ操作ロジック ---
export function switchTab(id) {
  tabs.forEach(t => t.active = (t.id === id));
  renderTabs(); UpdateDisplay(); UpdateHistory();
  saveCurrentSession();
}

export function addTab() {
  tabs.forEach(t => t.active = false);
  tabs.push({ id: Date.now(), workFile: '', workFileSize: 0, backupDir: '', active: true });
  renderTabs(); UpdateDisplay(); UpdateHistory();
  saveCurrentSession();
}

export function removeTab(id) {
  const index = tabs.findIndex(t => t.id === id);
  const wasActive = tabs[index].active;
  tabs.splice(index, 1);
  if (wasActive) tabs[Math.max(0, index - 1)].active = true;
  renderTabs(); UpdateDisplay(); UpdateHistory();
  saveCurrentSession();
}

// --- 実行ロジック ---
export async function OnExecute() {
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

// --- 復元・適用ロジック ---
export async function applySelectedBackups() {
  const tab = getActiveTab();
  const targets = Array.from(document.querySelectorAll('.diff-checkbox:checked')).map(el => el.value);
  if (targets.length > 0 && confirm(i18n.restoreConfirm)) {
    toggleProgress(true, "Restoring...");
    try {
      for (const p of targets) {
        await RestoreBackup(p, tab.workFile);
      }
      toggleProgress(false);
      showFloatingMessage(i18n.diffApplySuccess);
      UpdateHistory();
    }
    catch (err) { toggleProgress(false); alert(err); }
  }
}
