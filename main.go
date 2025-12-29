package main

import (
	//"fmt"
	"embed"
	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
        "github.com/wailsapp/wails/v2/pkg/options"
)


//go:embed all:frontend/dist
var assets embed.FS

func main() {
	// Create an instance of the app structure
	app := NewApp()
	menu := app.setupMenu()
	// Create application with options

	err := wails.Run(&options.App{
	Title:         "cg-file-backup",
	Width:         480,
	Height:        350,
	MinWidth:      480,
	MinHeight:     350,
	MaxWidth:      480,
	MaxHeight:     350,
	DisableResize: true,

	AssetServer: &assetserver.Options{
		Assets: assets,
	},
	BackgroundColour: &options.RGBA{R: 27, G: 38, B: 54, A: 1},
	OnStartup:        app.startup,
	Menu: menu,
	Bind: []interface{}{
		app,
	},
})

	if err != nil {
		println("Error:", err.Error())
	}
}
