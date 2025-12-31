package main

import (
	"embed"
	"os"
	"path/filepath"
	goruntime "runtime"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// --- Windows版: bzip2-bin/bzip2.exe を PATH に追加 ---
	if goruntime.GOOS == "windows" {
		ex, err := os.Executable()
		if err == nil {
			// 実行ファイルがあるディレクトリを取得
			exDir := filepath.Dir(ex)
			// bzip2-bin フォルダへのフルパスを作成
			bzipDir := filepath.Join(exDir, "bzip2-bin")
			
			// 現在の PATH を取得して先頭に追加
			currentPath := os.Getenv("PATH")
			os.Setenv("PATH", bzipDir+string(os.PathListSeparator)+currentPath)
		}
	}
	// --------------------------------------------------

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
