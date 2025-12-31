package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"encoding/json"
	_ "fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/kr/binarydist"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	_ "embed"
	goruntime "runtime"
	"os/exec"
)

//go:embed frontend/src/assets/AppConfig.json
var embeddedConfig []byte

type App struct {
	ctx        context.Context
	cfg        *AppConfig
	configPath string
}

// JS側で確実に受け取るための構造体
type DiffFileInfo struct {
	FileName  string `json:"fileName"`  // test-project.clip.2025...diff が入る
	FilePath  string `json:"filePath"`  // フルパスが入る
	Timestamp string `json:"timestamp"` // 2025... 部分が入る
}

func NewApp() *App {
	cfg, path, err := LoadAppConfig()
	if err != nil {
		panic(err)
	}
	return &App{
		cfg:        cfg,
		configPath: path,
	}
}

// ----------------- UI / 設定 / メニュー -----------------

func (a *App) startup(Ctx context.Context) {
	a.ctx = Ctx
	runtime.WindowSetAlwaysOnTop(a.ctx, a.GetAlwaysOnTop())
}

func (a *App) GetConfig() *AppConfig {
	return a.cfg
}

func (a *App) SaveConfig(config AppConfig) error {
	a.cfg.AlwaysOnTop = config.AlwaysOnTop
	a.cfg.Language = config.Language
	a.cfg.AutoOpen = config.AutoOpen
	data, err := json.MarshalIndent(a.cfg, "", "  ")
	if err != nil { return err }
	return os.WriteFile(a.configPath, data, 0644)
}

func (a *App) GetLanguageText(Key string) string {
	Lang := a.cfg.Language
	if Lang == "" { Lang = "ja" }
	if V, Ok := a.cfg.I18N[Lang][Key]; Ok { return V }
	return Key
}

func (a *App) GetI18N() map[string]string {
	Lang := a.cfg.Language
	if Lang == "" { Lang = "ja" }
	return a.cfg.I18N[Lang]
}

func (a *App) GetAlwaysOnTop() bool { return a.cfg.AlwaysOnTop }

func (a *App) SetLanguage(Lang string) error {
	a.cfg.Language = Lang
	data, err := json.MarshalIndent(a.cfg, "", "  ")
	if err != nil { return err }
	return os.WriteFile(a.configPath, data, 0644)
}

func (a *App) SetAlwaysOnTop(Flag bool) error {
	a.cfg.AlwaysOnTop = Flag
	data, err := json.MarshalIndent(a.cfg, "", "  ")
	if err != nil { return err }
	return os.WriteFile(a.configPath, data, 0644)
}

func (a *App) setupMenu() *menu.Menu {
	alwaysOnTopItem := menu.Checkbox(a.GetLanguageText("alwaysOnTop"), a.GetAlwaysOnTop(), nil, func(_ *menu.CallbackData) {
		newValue := !a.GetAlwaysOnTop()
		_ = a.SetAlwaysOnTop(newValue)
		runtime.WindowSetAlwaysOnTop(a.ctx, newValue)
	})
	englishItem := menu.Radio(a.GetLanguageText("english"), a.cfg.Language == "en", nil, func(_ *menu.CallbackData) {
		_ = a.SetLanguage("en")
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{Title: "Language", Message: "Restart required."})
	})
	japaneseItem := menu.Radio(a.GetLanguageText("japanese"), a.cfg.Language == "ja", nil, func(_ *menu.CallbackData) {
		_ = a.SetLanguage("ja")
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{Title: "言語設定", Message: "再起動が必要です。"})
	})
	quitItem := menu.Text(a.GetLanguageText("quit"), keys.CmdOrCtrl("q"), func(_ *menu.CallbackData) { runtime.Quit(a.ctx) })
	
	settingsMenu := menu.NewMenu()
	settingsMenu.Items = []*menu.MenuItem{alwaysOnTopItem, menu.Separator(), englishItem, japaneseItem, menu.Separator(), quitItem}
	
	aboutMenu := menu.NewMenu()
	aboutText := menu.Text(a.GetLanguageText("about"), keys.CmdOrCtrl("a"), func(_ *menu.CallbackData) {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{Title: a.GetLanguageText("about"), Message: a.GetLanguageText("aboutText")})
	})
	aboutMenu.Items = []*menu.MenuItem{aboutText}
	
	rootMenu := menu.NewMenu()
	rootMenu.Items = []*menu.MenuItem{menu.SubMenu(a.GetLanguageText("settings"), settingsMenu), menu.SubMenu(a.GetLanguageText("about"), aboutMenu)}
	return rootMenu
}

// ----------------- 差分・履歴管理 (表示修復) -----------------

func (a *App) GetDiffList(workFile, customDir string) ([]DiffFileInfo, error) {
	targetDir := customDir
	if targetDir == "" { targetDir = DefaultBackupDir(workFile) }
	
	files, err := os.ReadDir(targetDir)
	if err != nil {
		if os.IsNotExist(err) { return []DiffFileInfo{}, nil }
		return nil, err
	}
	
	var list []DiffFileInfo
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".diff") {
			ts, _ := extractTimestampFromBackup(f.Name())
			list = append(list, DiffFileInfo{
				FileName:  f.Name(), // ここで test-project.clip.2025...diff を丸ごと渡す
				FilePath:  filepath.Join(targetDir, f.Name()),
				Timestamp: ts,
			})
		}
	}
	return list, nil
}

func (a *App) BackupOrDiff(workFile, customDir string) error {
	targetDir := customDir
	if targetDir == "" { targetDir = DefaultBackupDir(workFile) }
	if err := os.MkdirAll(targetDir, 0755); err != nil { return err }

	baseName := filepath.Base(workFile)
	baseFull := filepath.Join(targetDir, baseName+".base")

	if _, err := os.Stat(baseFull); os.IsNotExist(err) {
		return CopyFile(workFile, baseFull)
	}
	ts := time.Now().Format("20060102_150405")
	diffPath := filepath.Join(targetDir, baseName+"."+ts+".diff")
	return a.CreateDiff(baseFull, workFile, diffPath)
}

func (a *App) ApplyMultiDiff(workFile string, diffPaths []string) error {
	for _, dp := range diffPaths {
		if err := a.ApplyDiff(workFile, dp); err != nil { return err }
	}
	return nil
}

func (a *App) CreateDiff(OldFile, NewFile, DiffFile string) error {
	oldF, err := os.Open(OldFile); if err != nil { return err }; defer oldF.Close()
	newF, err := os.Open(NewFile); if err != nil { return err }; defer newF.Close()
	diffF, err := os.Create(DiffFile); if err != nil { return err }; defer diffF.Close()
	return binarydist.Diff(oldF, newF, diffF)
}

func (a *App) ApplyDiff(workFile, diffFile string) error {
	backupDir := filepath.Dir(diffFile)
	baseName := strings.Split(filepath.Base(diffFile), ".20")[0] + ".base"
	baseFull := filepath.Join(backupDir, baseName)
	if _, err := os.Stat(baseFull); os.IsNotExist(err) {
		baseFull = filepath.Join(backupDir, filepath.Base(workFile)+".base")
	}

	oldF, err := os.Open(baseFull); if err != nil { return err }; defer oldF.Close()
	patchF, err := os.Open(diffFile); if err != nil { return err }; defer patchF.Close()
	outPath := autoOutputPath(workFile)
	outF, err := os.Create(outPath); if err != nil { return err }; defer outF.Close()
	return binarydist.Patch(oldF, outF, patchF)
}

// ----------------- ファイル操作実装 -----------------

func (a *App) CopyBackupFile(src, backupDir string) error {
	if backupDir == "" { backupDir = DefaultBackupDir(src) }
	os.MkdirAll(backupDir, 0755)
	return CopyFile(src, filepath.Join(backupDir, TimestampedName(src)))
}

func (a *App) ArchiveBackupFile(src, backupDir, format string) error {
	if backupDir == "" { backupDir = DefaultBackupDir(src) }
	os.MkdirAll(backupDir, 0755)
	if format == "zip" {
		return ZipBackupFile(src, backupDir)
	}
	return TarBackupFile(src, backupDir)
}

func ZipBackupFile(src, backupDir string) error {
	zipPath := filepath.Join(backupDir, TimestampedName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+".zip"))
	zf, err := os.Create(zipPath); if err != nil { return err }; defer zf.Close()
	archive := zip.NewWriter(zf); defer archive.Close()
	f, err := os.Open(src); if err != nil { return err }; defer f.Close()
	info, _ := f.Stat(); header, _ := zip.FileInfoHeader(info); header.Name = filepath.Base(src); header.Method = zip.Deflate
	writer, _ := archive.CreateHeader(header); io.Copy(writer, f)
	return nil
}

func TarBackupFile(src, backupDir string) error {
	tarPath := filepath.Join(backupDir, TimestampedName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+".tar.gz"))
	tf, err := os.Create(tarPath); if err != nil { return err }; defer tf.Close()
	gw := gzip.NewWriter(tf); defer gw.Close(); tw := tar.NewWriter(gw); defer tw.Close()
	f, err := os.Open(src); if err != nil { return err }; defer f.Close()
	info, _ := f.Stat(); header, _ := tar.FileInfoHeader(info, ""); header.Name = filepath.Base(src)
	tw.WriteHeader(header); io.Copy(tw, f)
	return nil
}

func CopyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil { return err }
	in, err := os.Open(src); if err != nil { return err }; defer in.Close()
	out, err := os.Create(dst); if err != nil { return err }; defer out.Close()
	if _, err := io.Copy(out, in); err != nil { return err }
	return out.Sync()
}

// ----------------- ヘルパー -----------------

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
	ext := filepath.Ext(original); name := strings.TrimSuffix(filepath.Base(original), ext)
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
