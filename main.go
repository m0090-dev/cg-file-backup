package main

import (
	"embed"
	"os"
	"path/filepath"
	"strings"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// --- 外部バイナリパスのセットアップ ---
	setupExternalBinPaths()

	// アプリケーションインスタンスの作成
	app := NewApp()
	menu := app.setupMenu()

	// 実行とオプション設定
	err := wails.Run(&options.App{
		Title: "cg-file-backup",
		// ツールボックスとしての黄金比 (横長コンパクト)
		Width:         660,
		Height:        500,
		MaxWidth: 660,
		EnableDefaultContextMenu: true,
		MaxHeight: 500,
		MinWidth:      660,
		MinHeight:     500,
		DisableResize: false,   
		DragAndDrop: &options.DragAndDrop{EnableFileDrop: true, DisableWebViewDrop: false},
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

// setupExternalBinPaths は開発時(wails dev)とビルド後両方でバイナリが見つかるようにPATHを設定します
func setupExternalBinPaths() {
	// 1. 実行バイナリの場所を取得
	ex, err := os.Executable()
	if err != nil {
		return
	}
	exDir := filepath.Dir(ex)

	// 2. 現在の作業ディレクトリ(wails dev実行時のプロジェクトルート)を取得
	cwd, err := os.Getwd()
	if err != nil {
		return
	}

	// 探索対象のフォルダリスト (ビルド後パス + 開発時パス)
	targets := []string{
		filepath.Join(exDir, "bzip2-bin"),
		filepath.Join(exDir, "hdiff-bin"),
		filepath.Join(cwd, "bzip2-bin"),
		filepath.Join(cwd, "hdiff-bin"),
	}

	currentPath := os.Getenv("PATH")
	var validPaths []string

	for _, path := range targets {
		// ディレクトリの実体が存在するか確認
		if info, err := os.Stat(path); err == nil && info.IsDir() {
			// OSが認識しやすいよう絶対パスに変換
			if absPath, err := filepath.Abs(path); err == nil {
				validPaths = append(validPaths, absPath)
			}
		}
	}

	// 新しいパスを追加（既存のPATHより優先されるよう先頭に追加）
	if len(validPaths) > 0 {
		newPathValue := strings.Join(validPaths, string(os.PathListSeparator)) +
			string(os.PathListSeparator) + currentPath
		os.Setenv("PATH", newPathValue)
	}
}
