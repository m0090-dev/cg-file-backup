package main

import (
    "encoding/json"
    "fmt"
    "archive/zip"
    "archive/tar"
    "compress/gzip"
    "time"
    "os"
    "io"
    "strings"
    "path/filepath"
    "context"
    "github.com/wailsapp/wails/v2/pkg/menu"
    "github.com/wailsapp/wails/v2/pkg/menu/keys"
    "github.com/wailsapp/wails/v2/pkg/runtime"
    _ "embed"
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

func (a *App) startup(ctx context.Context) {
    a.ctx = ctx

fmt.Printf("%#v\n", a.cfg.I18N[a.cfg.Language])
}

func (a *App) GetLanguageText(key string) string {
    lang := a.cfg.Language
    if lang == "" {
        lang = "ja"
    }
    if v, ok := a.cfg.I18N[lang][key]; ok {
        return v
    }
    return key
}

func (a *App) GetLanguage() string {
    return a.cfg.Language
}


func (a *App) SetLanguage(lang string) error {
    a.cfg.Language = lang

    data, err := json.MarshalIndent(a.cfg, "", "  ")
    if err != nil {
        return err
    }

    return os.WriteFile(a.configPath, data, 0644)
}

func (a *App) GetI18N() map[string]string {
    lang := a.cfg.Language
    if lang == "" {
        lang = "ja"
    }
    return a.cfg.I18N[lang]
}



func (a *App) setupMenu() *menu.Menu {
    // Always On Top の初期状態
    alwaysOnTop := false
    var alwaysOnTopItem *menu.MenuItem

    // Always On Top
    alwaysOnTopItem = menu.Checkbox(
        a.GetLanguageText("alwaysOnTop"),
        alwaysOnTop,
        nil,
        func(_ *menu.CallbackData) {
            alwaysOnTop = !alwaysOnTop
            runtime.WindowSetAlwaysOnTop(a.ctx, alwaysOnTop)
            alwaysOnTopItem.SetChecked(alwaysOnTop)
        },
    )

    // Language: English
    englishItem := menu.Radio(
        a.GetLanguageText("english"),
        a.cfg.Language == "en",
        nil,
        func(_ *menu.CallbackData) {
            _ = a.SetLanguage("en")
            runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
                Title:   a.GetLanguageText("language"),
                Message: a.GetLanguageText("restartRequired"),
            })
        },
    )

    // Language: Japanese
    japaneseItem := menu.Radio(
        a.GetLanguageText("japanese"),
        a.cfg.Language == "ja",
        nil,
        func(_ *menu.CallbackData) {
            _ = a.SetLanguage("ja")
            runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
                Title:   a.GetLanguageText("language"),
                Message: a.GetLanguageText("restartRequired"),
            })
        },
    )

    // Quit
    quitItem := menu.Text(
        a.GetLanguageText("quit"),
        keys.CmdOrCtrl("q"),
        func(_ *menu.CallbackData) {
            runtime.Quit(a.ctx)
        },
    )

    // Settings Menu
    settingsMenu := menu.NewMenu()
    settingsMenu.Items = []*menu.MenuItem{
        alwaysOnTopItem,
        menu.Separator(),
        englishItem,
        japaneseItem,
        menu.Separator(),
        quitItem,
    }

    // Root Menu
    rootMenu := menu.NewMenu()
    rootMenu.Items = []*menu.MenuItem{
        menu.SubMenu(a.GetLanguageText("settings"), settingsMenu),
    }

    return rootMenu
}

func zipBackupFile(src, backupDir string) error {
    if backupDir == "" {
        backupDir = defaultBackupDir(src)
    }

    if err := os.MkdirAll(backupDir, 0755); err != nil {
        return err
    }

    zipFilePath := filepath.Join(backupDir, timestampedName(src[:len(src)-len(filepath.Ext(src))]+".zip"))

    zipFile, err := os.Create(zipFilePath)
    if err != nil {
        return err
    }
    defer zipFile.Close()

    archive := zip.NewWriter(zipFile)
    defer archive.Close()

    fileToZip, err := os.Open(src)
    if err != nil {
        return err
    }
    defer fileToZip.Close()

    info, err := fileToZip.Stat()
    if err != nil {
        return err
    }

    header, err := zip.FileInfoHeader(info)
    if err != nil {
        return err
    }
    header.Name = filepath.Base(src)
    header.Method = zip.Deflate

    writer, err := archive.CreateHeader(header)
    if err != nil {
        return err
    }

    _, err = io.Copy(writer, fileToZip)
    return err
}
func tarBackupFile(src, backupDir string) error {
    if backupDir == "" {
        backupDir = defaultBackupDir(src)
    }

    if err := os.MkdirAll(backupDir, 0755); err != nil {
        return err
    }

    tarFilePath := filepath.Join(backupDir, timestampedName(src[:len(src)-len(filepath.Ext(src))]+".tar.gz"))
    tarFile, err := os.Create(tarFilePath)
    if err != nil {
        return err
    }
    defer tarFile.Close()

    gw := gzip.NewWriter(tarFile)
    defer gw.Close()
    tw := tar.NewWriter(gw)
    defer tw.Close()

    fileToTar, err := os.Open(src)
    if err != nil {
        return err
    }
    defer fileToTar.Close()

    info, err := fileToTar.Stat()
    if err != nil {
        return err
    }

    header, err := tar.FileInfoHeader(info, "")
    if err != nil {
        return err
    }
    header.Name = filepath.Base(src)

    if err := tw.WriteHeader(header); err != nil {
        return err
    }

    _, err = io.Copy(tw, fileToTar)
    return err
}


func (a *App) ArchiveBackupFile(src, backupDir, format string) error {
    switch format {
    case "zip":
        return zipBackupFile(src, backupDir)
    case "tar":
        return tarBackupFile(src, backupDir)
    default:
        return fmt.Errorf("unsupported archive format: %s", format)
    }
}


func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()

	if _, err := io.Copy(out, in); err != nil {
		return err
	}

	return out.Sync()
}



func (a *App) SelectWorkFile() (string, error) {
	return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "作業ファイル選択",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "CG Work Files",
				Pattern:     "*.clip;*.kra;*.psd",
			},
		},
	})
}


func (a *App) SelectBackupFolder() (string, error) {
	return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "バックアップフォルダ選択",
	})
}



func defaultBackupDir(workFile string) string {
	base := filepath.Base(workFile)
	name := strings.TrimSuffix(base, filepath.Ext(base))
	return filepath.Join(
		filepath.Dir(workFile),
		"cg_backup_"+name,
	)
}



func timestampedName(original string) string {
	ext := filepath.Ext(original)
	name := strings.TrimSuffix(filepath.Base(original), ext)

	ts := time.Now().Format("2006-01-02_15-04-05")
	return name + "_" + ts + ext
}


func copyBackupFile(src, backupDir string) error {
	if backupDir == "" {
		backupDir = defaultBackupDir(src)
	}

	err := os.MkdirAll(backupDir, 0755)
	if err != nil {
		return err
	}

	dst := filepath.Join(backupDir, timestampedName(src))
	return copyFile(src, dst)
}



func (a *App) CopyBackupFile(workFile string, backupDir string) error {
	return copyBackupFile(workFile, backupDir)
}
