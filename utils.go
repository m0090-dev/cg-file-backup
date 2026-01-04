package main
import (
	"github.com/wailsapp/wails/v2/pkg/runtime"
	"os"
	"path/filepath"
	"strings"
	"time"
	"os/exec"
	goruntime "runtime"
	"fmt"
)


func (a *App) ToggleCompactMode(isCompact bool) {
	// 共通：一度リセットして操作を受け付けやすくする
	runtime.WindowSetMinSize(a.ctx, 0, 0)
	runtime.WindowSetMaxSize(a.ctx, 0, 0)
	runtime.WindowUnmaximise(a.ctx)

	if isCompact {
		// コンパクトモードの設定 (300x200固定)
		width, height := 300, 240
		runtime.WindowSetSize(a.ctx, width, height)
		runtime.WindowSetTitle(a.ctx, "cg-file-backup (Compact mode)")
		runtime.WindowSetMinSize(a.ctx, width, height)
		runtime.WindowSetMaxSize(a.ctx, width, height)
	} else {
		// 通常モードの設定 (660x500固定)
		// ここを 0, 0 にせず、現在のサイズで固定するのがポイントです
		width, height := 660, 500
		runtime.WindowSetSize(a.ctx, width, height)
		runtime.WindowSetTitle(a.ctx, "cg-file-backup")
		runtime.WindowSetMinSize(a.ctx, width, height)
		runtime.WindowSetMaxSize(a.ctx, width, height)
	}
}


// GetConfigDir はOSごとの設定ディレクトリパスを返します
func (a *App) GetConfigDir() string {
	// OS標準の設定ディレクトリを取得 (Windows: %AppData%, macOS: ~/Library/Application Support, Linux: ~/.config)
	configDir, err := os.UserConfigDir()
	if err != nil {
		// 取得失敗時のフォールバック（カレントディレクトリなど）
		return "./config"
	}

	// アプリ専用のサブフォルダ名（アプリ名に合わせて変更してください）
	appFolderName := "cg-file-backup"
	fullPath := filepath.Join(configDir, appFolderName)

	// ディレクトリが存在しない場合は作成しておく
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		_ = os.MkdirAll(fullPath, 0755)
	}

	return fullPath
}



func extractTimestampFromBackup(path string) (string, error) {
	base := filepath.Base(path)
	parts := strings.Split(base, ".")
	// test.clip.20251231_150000.diff -> 20251231_150000 を返す
	if len(parts) >= 3 {
		return parts[len(parts)-2], nil
	}
	return "No Timestamp", nil
}

func autoOutputPath(workFile string) string {
	dir := filepath.Dir(workFile)
	base := strings.TrimSuffix(filepath.Base(workFile), filepath.Ext(workFile))
	ext := filepath.Ext(workFile)
	ts := time.Now().Format("20060102_150405")
	return filepath.Join(dir, base+"_restored_"+ts+ext)
}

func DefaultBackupDir(workFile string) string {
	dir := filepath.Dir(workFile)
	name := strings.TrimSuffix(filepath.Base(workFile), filepath.Ext(workFile))
	return filepath.Join(dir, "cg_backup_"+name)
}

func TimestampedName(original string) string {
	ext := filepath.Ext(original)
	name := strings.TrimSuffix(filepath.Base(original), ext)
	return name + "_" + time.Now().Format("20060102_150405") + ext
}

func (a *App) SelectAnyFile(title string, filters []runtime.FileFilter) (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{Title: title, Filters: filters})
}

func (a *App) SelectBackupFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{Title: "Folder Select"})
}

func (a *App) OpenDirectory(path string) {
	target := filepath.Dir(path)
	if goruntime.GOOS == "windows" {
		exec.Command("explorer", filepath.Clean(target)).Run()
	} else {
		exec.Command("open", target).Run()
	}
}

func (a *App) GetFileSize(path string) (int64, error) {
	if path == "" {
		return 0, fmt.Errorf("path is empty")
	}

	info, err := os.Stat(path)
	if err != nil {
		return 0, err
	}

	if info.IsDir() {
		return 0, fmt.Errorf("path is a directory")
	}

	return info.Size(), nil
}


