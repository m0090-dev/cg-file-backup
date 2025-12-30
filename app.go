package main

import (
    bsdiff "github.com/icedream/go-bsdiff"
    "archive/tar"
    "archive/zip"
    "compress/gzip"
    "context"
    "encoding/json"
    "fmt"
    "io"
    "os"
    "path/filepath"
    "strings"
    "time"

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



// ----------------- UI / 設定 -----------------

func (a *App) startup(Ctx context.Context) {
    a.ctx = Ctx
    runtime.WindowSetAlwaysOnTop(a.ctx, a.GetAlwaysOnTop())
}

func (a *App) GetLanguageText(Key string) string {
    Lang := a.cfg.Language
    if Lang == "" {
        Lang = "ja"
    }
    if V, Ok := a.cfg.I18N[Lang][Key]; Ok {
        return V
    }
    return Key
}

func (a *App) GetLanguage() string {
    return a.cfg.Language
}

func (a *App) GetAlwaysOnTop() bool {
    return a.cfg.AlwaysOnTop
}

func (a *App) SetLanguage(Lang string) error {
    a.cfg.Language = Lang
    Data, Err := json.MarshalIndent(a.cfg, "", "  ")
    if Err != nil {
        return Err
    }
    return os.WriteFile(a.configPath, Data, 0644)
}

func (a *App) GetI18N() map[string]string {
    Lang := a.cfg.Language
    if Lang == "" {
        Lang = "ja"
    }
    return a.cfg.I18N[Lang]
}

func (a *App) SetAlwaysOnTop(Flag bool) error {
    a.cfg.AlwaysOnTop = Flag
    Data, Err := json.MarshalIndent(a.cfg, "", "  ")
    if Err != nil {
        return Err
    }
    return os.WriteFile(a.configPath, Data, 0644)
}


func (a *App) setupMenu() *menu.Menu {
    // Always On Top の初期状態
    alwaysOnTop := a.GetAlwaysOnTop()
    var alwaysOnTopItem *menu.MenuItem

    // Always On Top チェックボックス
    alwaysOnTopItem = menu.Checkbox(
        a.GetLanguageText("alwaysOnTop"),
        alwaysOnTop,
        nil,
        func(_ *menu.CallbackData) {
            // 現在状態の反転
            newValue := !a.GetAlwaysOnTop()
            // セッターで状態更新とファイル保存
            _ = a.SetAlwaysOnTop(newValue)
            // ウィンドウ上の反映
            runtime.WindowSetAlwaysOnTop(a.ctx, newValue)
            // チェックボックス更新
            alwaysOnTopItem.SetChecked(newValue)
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

    // About Menu
    aboutMenu := menu.NewMenu()
    aboutText := menu.Text(
        a.GetLanguageText("about"),
        keys.CmdOrCtrl("a"),
        func(_ *menu.CallbackData) {
            runtime.MessageDialog(a.ctx, runtime.MessageDialogOptions{
                Title:   a.GetLanguageText("about"),
                Message: a.GetLanguageText("aboutText"),
            })
        },
    )
    aboutMenu.Items = []*menu.MenuItem{
        aboutText,
    }

    // Root Menu
    rootMenu := menu.NewMenu()
    rootMenu.Items = []*menu.MenuItem{
        menu.SubMenu(a.GetLanguageText("settings"), settingsMenu),
        menu.SubMenu(a.GetLanguageText("about"), aboutMenu),
    }

    return rootMenu
}



// ----------------- 差分バックアップ -----------------

func (a *App) CreateDiff(OldFile, NewFile, DiffFile string) error {
    OldF, err := os.Open(OldFile)
    if err != nil {
        return err
    }
    defer OldF.Close()

    NewF, err := os.Open(NewFile)
    if err != nil {
        return err
    }
    defer NewF.Close()

    DiffF, err := os.Create(DiffFile)
    if err != nil {
        return err
    }
    defer DiffF.Close()

    return bsdiff.Diff(OldF, NewF, DiffF)
}

func (a *App) ApplyDiff(OldFile, DiffFile, OutFile string) error {
    OldF, err := os.Open(OldFile)
    if err != nil {
        return err
    }
    defer OldF.Close()

    DiffF, err := os.Open(DiffFile)
    if err != nil {
        return err
    }
    defer DiffF.Close()

    OutF, err := os.Create(OutFile)
    if err != nil {
        return err
    }
    defer OutF.Close()

    return bsdiff.Patch(OldF, DiffF, OutF)
}

// ----------------- フルバックアップ作成 -----------------

func CreateFullBackup(workFile, backupDir string) (string, error) {
    if backupDir == "" {
        backupDir = DefaultBackupDir(workFile)
    }
    if err := os.MkdirAll(backupDir, 0755); err != nil {
        return "", err
    }

    base := filepath.Base(workFile)
    ext := filepath.Ext(base)
    nameOnly := base[:len(base)-len(ext)]
    ts := time.Now().Format("20060102_150405")
    backupFile := filepath.Join(backupDir, nameOnly+"_"+ts+ext)

    if err := CopyFile(workFile, backupFile); err != nil {
        return "", err
    }
    return backupFile, nil
}

// ----------------- 最新フルバックアップ取得 -----------------

func FindLatestFullBackup(backupDir, workFile string) (string, error) {
    base := filepath.Base(workFile)
    ext := filepath.Ext(base)
    nameOnly := base[:len(base)-len(ext)]

    files, err := os.ReadDir(backupDir)
    if err != nil {
        return "", err
    }

    var latest string
    var latestTime time.Time

    for _, f := range files {
        if f.IsDir() {
            continue
        }
        fname := f.Name()
        if !strings.HasPrefix(fname, nameOnly+"_") || !strings.HasSuffix(fname, ext) {
            continue
        }
        tsStr := strings.TrimSuffix(strings.TrimPrefix(fname, nameOnly+"_"), ext)
        t, err := time.Parse("20060102_150405", tsStr)
        if err != nil {
            continue
        }
        if t.After(latestTime) {
            latestTime = t
            latest = filepath.Join(backupDir, fname)
        }
    }

    return latest, nil
}

// ----------------- BackupOrDiff -----------------

func (a *App) BackupOrDiff(workFile, backupDir, diffMode string, compress bool) error {
    if backupDir == "" {
        backupDir = DefaultBackupDir(workFile)
    }
    if err := os.MkdirAll(backupDir, 0755); err != nil {
        return err
    }

    lastBackup, err := FindLatestFullBackup(backupDir, workFile)
    if err != nil {
        return err
    }

    // 初回フルバックアップ
    if lastBackup == "" {
        _, err := CreateFullBackup(workFile, backupDir)
        return err
    }

    // 差分作成
    base := strings.TrimSuffix(filepath.Base(workFile), filepath.Ext(workFile))
    ts := time.Now().Format("20060102_150405")
    diffFile := filepath.Join(backupDir, base+"_"+ts+".diff")

    return a.CreateDiff(lastBackup, workFile, diffFile)
}

// ----------------- CopyFile（低レイヤー） -----------------

func CopyFile(src, dst string) error {
    if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
        return err
    }

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


// ----------------- アーカイブバックアップ -----------------

func (a *App) ArchiveBackupFile(src, backupDir, format string) error {
    switch format {
    case "zip":
        return ZipBackupFile(src, backupDir)
    case "tar":
        return TarBackupFile(src, backupDir)
    default:
        return fmt.Errorf("unsupported archive format: %s", format)
    }
}

func ZipBackupFile(src, backupDir string) error {
    if backupDir == "" {
        backupDir = DefaultBackupDir(src)
    }
    if err := os.MkdirAll(backupDir, 0755); err != nil {
        return err
    }

    zipPath := filepath.Join(backupDir, TimestampedName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+".zip"))
    zipFile, err := os.Create(zipPath)
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

func TarBackupFile(src, backupDir string) error {
    if backupDir == "" {
        backupDir = DefaultBackupDir(src)
    }
    if err := os.MkdirAll(backupDir, 0755); err != nil {
        return err
    }

    tarPath := filepath.Join(backupDir, TimestampedName(strings.TrimSuffix(filepath.Base(src), filepath.Ext(src))+".tar.gz"))
    tarFile, err := os.Create(tarPath)
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

// ----------------- ファイル名補助 -----------------

func TimestampedName(original string) string {
    ext := filepath.Ext(original)
    name := strings.TrimSuffix(filepath.Base(original), ext)
    ts := time.Now().Format("20060102_150405")
    return name + "_" + ts + ext
}

func DefaultBackupDir(workFile string) string {
    base := filepath.Base(workFile)
    name := strings.TrimSuffix(base, filepath.Ext(base))
    return filepath.Join(filepath.Dir(workFile), "cg_backup_"+name)
}

func (a *App) CopyBackupFile(src, backupDir string) error {
    if backupDir == "" {
        backupDir = DefaultBackupDir(src)
    }

    // 出力先ディレクトリ作成
    if err := os.MkdirAll(backupDir, 0755); err != nil {
        return err
    }

    // タイムスタンプ付きファイル名
    dst := filepath.Join(backupDir, TimestampedName(src))

    // コピー実行
    return CopyFile(src, dst)
}

// ----------------- ファイル選択 ----------------- 


// SelectAnyFile opens a file dialog with a custom title and filters.
// title: ダイアログタイトル
// filters: フィルター配列 [{DisplayName: "説明", Pattern: "*.ext;*.ext2"}]
// 戻り値: 選択されたファイルパス、もしくはキャンセル時は空文字
func (a *App) SelectAnyFile(title string, filters []runtime.FileFilter) (string, error) {
    return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{
        Title:   title,
        Filters: filters,
    })
}

func (a *App) SelectWorkFile() (string, error) { 
return runtime.OpenFileDialog(a.ctx, runtime.OpenDialogOptions{ Title: "作業ファイル選択", Filters: []runtime.FileFilter{ { DisplayName: "CG Work Files", Pattern: "*.clip;*.kra;*.psd", }, }, }) } 
func (a *App) SelectBackupFolder() (string, error) { return runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{ Title: "バックアップフォルダ選択", }) }
