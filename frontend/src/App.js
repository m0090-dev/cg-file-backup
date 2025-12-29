
import {
  SelectWorkFile,
  SelectBackupFolder,
  CopyBackupFile,
  ArchiveBackupFile,
  GetI18N
} from '../wailsjs/go/main/App';

let i18n = {};
let workFile = '';
let backupDir = '';

function showMessage(text) {
  const el = document.getElementById('message-area');
  el.textContent = text;
  el.classList.remove('hidden');

  setTimeout(() => {
    el.classList.add('hidden');
  }, 3000);
}

async function loadI18NOnce() {
  i18n = await GetI18N();
  applyI18N();
}

function applyI18N() {
  document.getElementById('workfile-btn').textContent = i18n.workFileBtn;
  document.getElementById('backupdir-btn').textContent = i18n.backupDirBtn;
  document.getElementById('execute-backup-btn').textContent = i18n.executeBtn;

  document.querySelector('input[value="copy"]').parentElement.lastChild.textContent =
    ' ' + i18n.copyBackupBtn;
  document.querySelector('input[value="archive"]').parentElement.lastChild.textContent =
    ' ' + i18n.archiveBtn;

  updateSelectionInfo();
}

function updateSelectionInfo() {
  document.getElementById('selected-workfile').textContent =
    workFile || i18n.selectedWorkFile;
  document.getElementById('selected-backupdir').textContent =
    backupDir || i18n.selectedBackupDir;
}

function selectWorkFileJS() {
  SelectWorkFile().then(path => {
    if (path) workFile = path;
    updateSelectionInfo();
  });
}

function selectBackupFolderJS() {
  SelectBackupFolder().then(path => {
    if (path) backupDir = path;
    updateSelectionInfo();
  });
}

function updateBackupModeUI() {
  const mode = document.querySelector('input[name="backupMode"]:checked').value;
  const archiveOptions = document.getElementById('archive-options');

  if (mode === 'archive') {
    archiveOptions.classList.remove('hidden');
  } else {
    archiveOptions.classList.add('hidden');
  }
}

function executeBackupJS() {
  if (!workFile) {
    showMessage(i18n.selectedWorkFile);
    return;
  }

  const mode = document.querySelector('input[name="backupMode"]:checked').value;

  if (mode === 'copy') {
    CopyBackupFile(workFile, backupDir)
      .then(() => {
        showMessage(i18n.copyBackupSuccess);
      })
      .catch(err => alert(err));
  } else {
    const format = document.getElementById('archive-format').value;
    ArchiveBackupFile(workFile, backupDir, format)
      .then(() => {
        showMessage(
          i18n.archiveBackupSuccess.replace('{format}', format.toUpperCase())
        );
      })
      .catch(err => alert(err));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('workfile-btn').onclick = selectWorkFileJS;
  document.getElementById('backupdir-btn').onclick = selectBackupFolderJS;
  document.getElementById('execute-backup-btn').onclick = executeBackupJS;

  document
    .querySelectorAll('input[name="backupMode"]')
    .forEach(radio => {
      radio.addEventListener('change', updateBackupModeUI);
    });

  updateBackupModeUI();
  loadI18NOnce();
});
