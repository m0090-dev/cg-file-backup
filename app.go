package main

import (
	"fmt"
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

	//"github.com/kr/binarydist"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
	_ "embed"
	goruntime "runtime"
	"os/exec"
	pwzip "github.com/alexmullins/zip"
)

//go:embed frontend/src/assets/AppConfig.json
var embeddedConfig []byte

type App struct {
	ctx        context.Context
	cfg        *AppConfig
	configPath string
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
func (a *App) GetRestorePreviousState() bool {return a.cfg.RestorePreviousState}

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

func (a *App) SetRestorePreviousState(Flag bool) error {
	a.cfg.RestorePreviousState = Flag
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

	// --- 追加: 前回の状態を復元するチェックボックス ---
	restoreStateItem := menu.Checkbox(a.GetLanguageText("restoreState"), a.GetRestorePreviousState(), nil, func(_ *menu.CallbackData) {
		newValue := !a.GetRestorePreviousState()
		_ = a.SetRestorePreviousState(newValue)
	})
	// -------------------------------------------

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
	// restoreStateItem をリストに追加しました
	settingsMenu.Items = []*menu.MenuItem{
		alwaysOnTopItem, 
		restoreStateItem, // 追加箇所
		menu.Separator(), 
		englishItem, 
		japaneseItem, 
		menu.Separator(), 
		quitItem,
	}
	
	aboutMenu := menu.NewMenu()
	aboutText := menu.Text(a.GetLanguageText("about"), keys.CmdOrCtrl("a"), func(_ *menu.CallbackData) {
		runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{Title: a.GetLanguageText("about"), Message: a.GetLanguageText("aboutText")})
	})
	aboutMenu.Items = []*menu.MenuItem{aboutText}
	
	rootMenu := menu.NewMenu()
	rootMenu.Items = []*menu.MenuItem{menu.SubMenu(a.GetLanguageText("settings"), settingsMenu), menu.SubMenu(a.GetLanguageText("about"), aboutMenu)}
	return rootMenu
}





// ----------------- ファイル操作実装 (パスワード対応) -----------------

// CopyBackupFile はファイルをそのままコピーします
func (a *App) CopyBackupFile(src, backupDir string) error {
	if backupDir == "" {
		backupDir = DefaultBackupDir(src)
	}
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return err
	}
	return CopyFile(src, filepath.Join(backupDir, TimestampedName(src)))
}

// ArchiveBackupFile は指定された形式で圧縮バックアップを作成します
func (a *App) ArchiveBackupFile(src, backupDir, format, password string) error {
	if backupDir == "" {
		backupDir = DefaultBackupDir(src)
	}
	if err := os.MkdirAll(backupDir, 0755); err != nil {
		return err
	}

	if format == "zip" {
		return ZipBackupFile(src, backupDir, password)
	}
	// Tarはパスワード非対応
	return TarBackupFile(src, backupDir)
}

// ZipBackupFile はパスワードの有無によりライブラリを使い分けてZIPを作成します
func ZipBackupFile(src, backupDir, password string) error {
	zipPath := filepath.Join(backupDir, TimestampedName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+".zip"))
	
	zf, err := os.Create(zipPath)
	if err != nil { return err }
	defer zf.Close()

	f, err := os.Open(src)
	if err != nil { return err }
	defer f.Close()

	if password != "" {
		// --- パスワードあり (alexmullins/zip を使用) ---
		archive := pwzip.NewWriter(zf)
		defer archive.Close()

		// ライブラリのサンプルに従い、Encrypt で直接 Writer を作成
		// 引数は (ファイル名, パスワード) の2つのみ
		writer, err := archive.Encrypt(filepath.Base(src), password)
		if err != nil {
			return err
		}
		
		_, err = io.Copy(writer, f)
		if err != nil {
			return err
		}
		
		return archive.Flush() // 書き込みを確定させるために Flush を呼ぶ

	} else {
		// --- パスワードなし (標準 archive/zip を使用) ---
		archive := zip.NewWriter(zf)
		defer archive.Close()

		info, err := f.Stat()
		if err != nil { return err }

		header, err := zip.FileInfoHeader(info)
		if err != nil { return err }
		header.Name = filepath.Base(src)
		header.Method = zip.Deflate

		writer, err := archive.CreateHeader(header)
		if err != nil { return err }
		
		_, err = io.Copy(writer, f)
		return err
	}
}



// TarBackupFile は .tar.gz 形式で圧縮します
func TarBackupFile(src, backupDir string) error {
	tarPath := filepath.Join(backupDir, TimestampedName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+".tar.gz"))
	tf, err := os.Create(tarPath)
	if err != nil { return err }
	defer tf.Close()

	gw := gzip.NewWriter(tf)
	defer gw.Close()
	tw := tar.NewWriter(gw)
	defer tw.Close()

	f, err := os.Open(src)
	if err != nil { return err }
	defer f.Close()

	info, err := f.Stat()
	if err != nil { return err }
	header, err := tar.FileInfoHeader(info, "")
	if err != nil { return err }
	header.Name = filepath.Base(src)

	if err := tw.WriteHeader(header); err != nil { return err }
	_, err = io.Copy(tw, f)
	return err
}


// RestoreArchive は ZIP または TAR からファイルを復元します
func (a *App) RestoreArchive(archivePath, workFile string) error {
	ext := filepath.Ext(archivePath)
	_ = filepath.Dir(workFile)

	if ext == ".zip" {
		// ZIPの解凍
		r, err := zip.OpenReader(archivePath)
		if err != nil { return err }
		defer r.Close()

		for _, f := range r.File {
			// ワークファイル名と一致するファイル、または唯一のファイルを展開
			rc, err := f.Open()
			if err != nil { return err }
			defer rc.Close()

			dstFile, err := os.Create(workFile)
			if err != nil { return err }
			defer dstFile.Close()

			_, err = io.Copy(dstFile, rc)
			return err // 1つ目のファイルで終了（バックアップ用途のため）
		}
	} else if strings.HasSuffix(archivePath, ".tar.gz") {
		// TARの解凍
		f, err := os.Open(archivePath)
		if err != nil { return err }
		defer f.Close()

		gzr, err := gzip.NewReader(f)
		if err != nil { return err }
		defer gzr.Close()

		tr := tar.NewReader(gzr)
		for {
			_, err := tr.Next()
			if err == io.EOF { break }
			if err != nil { return err }

			dstFile, err := os.Create(workFile)
			if err != nil { return err }
			defer dstFile.Close()

			_, err = io.Copy(dstFile, tr)
			return err
		}
	}
	return fmt.Errorf("unsupported archive format")
}


// CopyFile は単純なファイルコピーを行います
func CopyFile(src, dst string) error {
	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil { return err }
	in, err := os.Open(src)
	if err != nil { return err }
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil { return err }
	defer out.Close()
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


func (a *App) GetBackupList(workFile, backupDir string) ([]BackupItem, error) {
	if backupDir == "" {
		backupDir = DefaultBackupDir(workFile)
	}

	files, err := os.ReadDir(backupDir)
	if err != nil {
		return nil, err
	}

	var list []BackupItem
	baseNameOnly := strings.TrimSuffix(filepath.Base(workFile), filepath.Ext(workFile))

	for _, f := range files {
		if f.IsDir() { continue }
		name := f.Name()

		// 1. ワークファイル名が含まれているか確認
		if !strings.Contains(name, baseNameOnly) {
			continue
		}

		// 2. 拡張子のフィルタリング
		// .tar.gz は特殊なので、HasSuffix で判定するのが確実です
		isValidExt := false
		if strings.HasSuffix(name, ".diff") || 
		   strings.HasSuffix(name, ".zip") || 
		   strings.HasSuffix(name, ".tar.gz") {
			isValidExt = true
		}

		if isValidExt {
			info, err := f.Info()
			if err != nil { continue } // 情報が取得できない場合はスキップ

			list = append(list, BackupItem{
				FileName:  name,
				FilePath:  filepath.Join(backupDir, name),
				Timestamp: info.ModTime().Format("2006-01-02 15:04:05"),
				FileSize:  info.Size(),
			})
		}
	}
	return list, nil
}



// RestoreBackup はファイル形式を自動判別して復元を実行します
func (a *App) RestoreBackup(path, workFile string) error {
	ext := strings.ToLower(filepath.Ext(path))

	// 1. 差分パッチ (.diff) 
	// ※ ApplyMultiDiff 内部で既に autoOutputPath が使われているのでそのままでOK
	if ext == ".diff" {
		return a.ApplyMultiDiff(workFile, []string{path}, "")
	}

	// ★ 復元先のパスを「別名」として生成する
	restoredPath := autoOutputPath(workFile)

	// 2. ZIPアーカイブ (.zip)
	if ext == ".zip" {
		r, err := zip.OpenReader(path)
		if err != nil { return err }
		defer r.Close()
		for _, f := range r.File {
			rc, err := f.Open()
			if err != nil { return err }
			defer rc.Close()
			// workFile ではなく restoredPath に保存
			return a.saveToWorkFile(rc, restoredPath)
		}
	}

	// 3. TARアーカイブ (.tar.gz)
	if strings.HasSuffix(strings.ToLower(path), ".tar.gz") {
		f, err := os.Open(path)
		if err != nil { return err }
		defer f.Close()
		gzr, err := gzip.NewReader(f)
		if err != nil { return err }
		defer gzr.Close()
		tr := tar.NewReader(gzr)
		if _, err := tr.Next(); err == nil {
			// workFile ではなく restoredPath に保存
			return a.saveToWorkFile(tr, restoredPath)
		}
	}

	// 4. フルコピー (.clip / .psd 等)
	// workFile ではなく restoredPath にコピー
	return CopyFile(path, restoredPath)
}


// ヘルパー: Readerの内容をワークファイルに書き出す
func (a *App) saveToWorkFile(r io.Reader, targetFile string) error {
	out, err := os.Create(targetFile)
	if err != nil { return err }
	defer out.Close()
	if _, err = io.Copy(out, r); err != nil { return err }
	return out.Sync() // ディスクへの書き込みを確定させる
}



// WriteTextFile は指定されたパスに文字列を書き込みます（汎用）
func (a *App) WriteTextFile(path string, content string) error {
    // フォルダが存在しない可能性も考慮する場合はここで作成しても良い
    return os.WriteFile(path, []byte(content), 0644)
}

// ReadTextFile は指定されたパスのファイルを文字列として読み込みます（汎用）
func (a *App) ReadTextFile(path string) (string, error) {
    if _, err := os.Stat(path); os.IsNotExist(err) {
        return "", nil // ファイルがない場合はエラーにせず空文字を返す
    }
    b, err := os.ReadFile(path)
    if err != nil {
        return "", err
    }
    return string(b), nil
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
