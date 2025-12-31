package main

import (
	"embed"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// アプリケーションインスタンスの作成
	app := NewApp()
	menu := app.setupMenu()

	// 実行とオプション設定
	err := wails.Run(&options.App{
		Title:  "cg-file-backup",
		// ツールボックスとしての黄金比 (横長コンパクト)
		Width:         660,
		Height:        500,
		MinWidth:      640,
		MinHeight:     480,
		DisableResize: true, // レイアウトを崩さないため固定

		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
		OnStartup:        app.startup,
		Menu:             menu,
		Bind: []interface{}{
			app,
		},
	})

	if err != nil {
		println("Error:", err.Error())
	}
}
