package main

import (
	"context"
	"encoding/json"
	"os"
	_ "embed"
	"github.com/wailsapp/wails/v2/pkg/menu"
	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/runtime"
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
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
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

func (a *App) GetI18N() map[string]string {
	Lang := a.cfg.Language
	if Lang == "" {
		Lang = "ja"
	}
	return a.cfg.I18N[Lang]
}

func (a *App) SetLanguage(Lang string) error {
	a.cfg.Language = Lang
	data, err := json.MarshalIndent(a.cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
}
func (a *App) GetAlwaysOnTop() bool { return a.cfg.AlwaysOnTop }

func (a *App) SetAlwaysOnTop(Flag bool) error {
	a.cfg.AlwaysOnTop = Flag
	data, err := json.MarshalIndent(a.cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
}
func (a *App) GetRestorePreviousState() bool { return a.cfg.RestorePreviousState }
func (a *App) GetBsdiffMaxFileSize() int64 {return a.cfg.BsdiffMaxFileSize}

func (a *App) SetRestorePreviousState(Flag bool) error {
	a.cfg.RestorePreviousState = Flag
	data, err := json.MarshalIndent(a.cfg, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(a.configPath, data, 0644)
}

func (a *App) setupMenu() *menu.Menu {
	
	alwaysOnTopItem := menu.Checkbox(a.GetLanguageText("alwaysOnTop"), a.GetAlwaysOnTop(), nil, func(_ *menu.CallbackData) {
		newValue := !a.GetAlwaysOnTop()
		_ = a.SetAlwaysOnTop(newValue)
		runtime.WindowSetAlwaysOnTop(a.ctx, newValue)
	})

	restoreStateItem := menu.Checkbox(a.GetLanguageText("restoreState"), a.GetRestorePreviousState(), nil, func(_ *menu.CallbackData) {
		newValue := !a.GetRestorePreviousState()
		_ = a.SetRestorePreviousState(newValue)
	})
      // スコープ内でフラグを保持（初期値は通常モードなのでfalse）
compactModeFlag := false

compactModeItem := menu.Checkbox(
    a.GetLanguageText("compactMode"),
    compactModeFlag,
    nil,
    func(cbData *menu.CallbackData) {
        // フラグを反転
        compactModeFlag = !compactModeFlag
        
        // メニュー自体のチェック状態を更新（これを行わないとチェックマークが変わりません）
        cbData.MenuItem.Checked = compactModeFlag
        
        // ウィンドウサイズとタイトルの変更を実行
        a.ToggleCompactMode(compactModeFlag)
	runtime.EventsEmit(a.ctx, "compact-mode-event", compactModeFlag)
    },
)
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
		restoreStateItem,
		compactModeItem,
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

