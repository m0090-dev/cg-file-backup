# cg-file-backup

A simple, lightweight backup utility built with Wails (Go + Svelte), specifically designed for managing 2DCG project files and work-in-progress versions.

This tool was created by the author for personal use to ensure quick and reliable versioning during creative workflows.

## 🔎 Key Features

- **Streamlined UI**: A single-window interface focused on "Backup" and "Restore."
- **Backup Modes**:
  - **Full Copy**: Creates a standard mirror of your files.
  - **Archive**: Compresses data into ZIP/TAR formats with optional password protection.
  - **Incremental (Smart)**: Saves disk space by backing up only modified parts (using Hdiff, etc.).
- **Quick Restore**: Browse your backup history and revert to a specific point in time with one click.

## 🚀 How to Use

1. **Target**: Select the file or folder you want to back up.
2. **Location**: Set the destination folder where backups will be stored.
3. **Execute**: Choose your preferred backup mode and click "Execute" (実行).
4. **Restore**: Select a previous version from the history list and click "Restore to selected point" (選択した時点へ復元).

## 🛠 For Developers

This application is built using [Wails](https://wails.io/).

### Prerequisites
- Go
- Node.js
- Wails CLI

### Commands
```bash
# Run in development mode
wails dev

# Build the application
wails build
