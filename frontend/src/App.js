
import {
  SelectAnyFile,
  SelectBackupFolder,
  CopyBackupFile,
  ArchiveBackupFile,
  GetI18N,
  CreateDiff,
  BackupOrDiff,
  ApplyDiff
} from '../wailsjs/go/main/App';

let i18n = {};
let workFile = '';
let backupDir = '';

// メッセージ表示
function ShowMessage(text) {
  const el = document.getElementById('message-area');
  el.textContent = text;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 3000);
}

// i18nロード
async function LoadI18NOnce() {
  i18n = await GetI18N();
  ApplyI18N();

  const mainTabButton = document.querySelector('.tab-link[data-tab="main-tab"]');
  if (mainTabButton) mainTabButton.textContent = i18n.copyBackupBtn;
}

// i18n適用
function ApplyI18N() {
  document.getElementById('workfile-btn').textContent = i18n.workFileBtn;
  document.getElementById('backupdir-btn').textContent = i18n.backupDirBtn;
  document.getElementById('execute-backup-btn').textContent = i18n.executeBtn;

  const diffSettingsBtn = document.getElementById('diff-settings-btn');
  if (diffSettingsBtn) diffSettingsBtn.textContent = i18n.diffBackupBtn;

  document.querySelector('input[value="copy"]').parentElement.lastChild.textContent = ' ' + i18n.copyBackupBtn;
  document.querySelector('input[value="archive"]').parentElement.lastChild.textContent = ' ' + i18n.archiveBtn;
  document.querySelector('input[value="diff"]').parentElement.lastChild.textContent = ' ' + i18n.diffBackupBtn;

  UpdateSelectionInfo();
}

// 選択情報更新
function UpdateSelectionInfo() {
  document.getElementById('selected-workfile').textContent = workFile || i18n.selectedWorkFile;
  document.getElementById('selected-backupdir').textContent = backupDir || i18n.selectedBackupDir;
}

// ファイル選択
async function SelectWorkFileJS() {
  const path = await SelectAnyFile("Select Work File", [{ DisplayName: "CG Work Files", Pattern: "*.clip;*.kra;*.psd" }]);
  if (path) workFile = path;
  UpdateSelectionInfo();
}

// バックアップフォルダ選択
async function SelectBackupFolderJS() {
  const path = await SelectBackupFolder();
  if (path) backupDir = path;
  UpdateSelectionInfo();
}

// バックアップモードUI切替
function UpdateBackupModeUI() {
  const mode = document.querySelector('input[name="backupMode"]:checked').value;
  document.getElementById('archive-options').classList.toggle('hidden', mode !== 'archive');
  document.getElementById('diff-settings-container').classList.toggle('hidden', mode !== 'diff');
}

// タブ切替
function SwitchTab(tabId) {
  document.querySelectorAll('.tab-link').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.style.display = (tab.id === tabId ? 'block' : 'none');
    tab.classList.toggle('active', tab.id === tabId);
  });
  const btn = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
  if (btn) btn.classList.add('active');
}

// タブ閉じる
function CloseTab(tabId) {
  if (tabId === 'main-tab') return;
  const tabHeader = document.querySelector(`.tab-link[data-tab="${tabId}"]`);
  const tabContent = document.getElementById(tabId);
  if (tabHeader) tabHeader.remove();
  if (tabContent) tabContent.remove();
  SwitchTab('main-tab');
}

// 差分設定タブ作成
function OpenDiffSettingsTab() {
  const tabId = 'diff-settings-tab';
  if (document.getElementById(tabId)) { SwitchTab(tabId); return; }

  const tabHeaders = document.getElementById('tab-headers');
  const newHeader = document.createElement('button');
  newHeader.className = 'tab-link';
  newHeader.dataset.tab = tabId;
  newHeader.textContent = i18n.diffBackupBtn;
  newHeader.addEventListener('contextmenu', e => { e.preventDefault(); CloseTab(tabId); });
  newHeader.onclick = () => SwitchTab(tabId);
  tabHeaders.appendChild(newHeader);

  const tabContents = document.getElementById('tab-contents');
  const newTab = document.createElement('div');
  newTab.id = tabId;
  newTab.className = 'tab-content';
  newTab.style.display = 'none';
  newTab.innerHTML = `
    <h3>${i18n.diffBackupBtn}</h3>
    <label><input type="radio" name="diffMode" value="diff" checked> ${i18n.diffMode}</label>
    <label><input type="radio" name="diffMode" value="incremental"> ${i18n.incrementalMode}</label>
    <br>
    <label><input type="checkbox" id="compress-diff"> ${i18n.compressDiff}</label>
    <br><br>
    <button id="apply-diff-btn">${i18n.applyDiffBtn || "Apply Diff"}</button>
  `;
  tabContents.appendChild(newTab);

  document.getElementById('apply-diff-btn').onclick = ExecuteDiffApplyJS;

  SwitchTab(tabId);
}

// バックアップ実行
async function ExecuteBackupJS() {
  if (!workFile) { ShowMessage(i18n.selectedWorkFile); return; }

  const mode = document.querySelector('input[name="backupMode"]:checked').value;

  if (mode === 'copy') {
    CopyBackupFile(workFile, backupDir)
      .then(() => ShowMessage(i18n.copyBackupSuccess))
      .catch(err => alert(err));
  } else if (mode === 'archive') {
    const format = document.getElementById('archive-format').value;
    ArchiveBackupFile(workFile, backupDir, format)
      .then(() => ShowMessage(i18n.archiveBackupSuccess.replace('{format}', format.toUpperCase())))
      .catch(err => alert(err));
  } else if (mode === 'diff') {
    const diffMode = document.querySelector('input[name="diffMode"]:checked')?.value || 'diff';
    const compress = document.getElementById('compress-diff')?.checked || false;

    BackupOrDiff(workFile, backupDir, diffMode, compress)
      .then(() => ShowMessage(i18n.diffBackupSuccess))
      .catch(err => alert(err));
  }
}

// 差分適用（汎用ファイル選択ダイアログ使用）
async function ExecuteDiffApplyJS() {
  // Diffファイル選択
  const selectedDiff = await SelectAnyFile("Select Diff File", [{ DisplayName: "Diff Files", Pattern: "*.diff" }]);
  if (!selectedDiff) return;

  // 出力先ファイル選択
  const outputFile = await SelectAnyFile("Select Output File", [{ DisplayName: "Output File", Pattern: "*" }]);
  if (!outputFile) return;

  ApplyDiff(workFile, selectedDiff, outputFile)
    .then(() => ShowMessage(i18n.diffApplySuccess || "Diff applied successfully"))
    .catch(err => alert(err));
}

// 初期化
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('workfile-btn').onclick = SelectWorkFileJS;
  document.getElementById('backupdir-btn').onclick = SelectBackupFolderJS;
  document.getElementById('execute-backup-btn').onclick = ExecuteBackupJS;
  document.getElementById('diff-settings-btn').onclick = OpenDiffSettingsTab;

  document.querySelectorAll('input[name="backupMode"]').forEach(radio => radio.addEventListener('change', UpdateBackupModeUI));

  const mainTabButton = document.querySelector('.tab-link[data-tab="main-tab"]');
  if (mainTabButton) mainTabButton.onclick = () => SwitchTab('main-tab');

  UpdateBackupModeUI();
  LoadI18NOnce();
  SwitchTab('main-tab');
});
