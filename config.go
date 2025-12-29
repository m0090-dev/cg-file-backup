package main
import  "path/filepath"
import "os"
import "encoding/json"

type AppConfig struct {
    Language string                         `json:"language"`
    I18N     map[string]map[string]string  `json:"i18n"`
}




func LoadAppConfig() (*AppConfig, string, error) {
    // ユーザー設定パス（例）
    dir, err := os.UserConfigDir()
    if err != nil {
        return nil, "", err
    }

    appDir := filepath.Join(dir, "cg-file-backup")
    _ = os.MkdirAll(appDir, 0755)

    configPath := filepath.Join(appDir, "AppConfig.json")

    var data []byte

    if _, err := os.Stat(configPath); err == nil {
        // ユーザー設定があればそれを読む
        data, err = os.ReadFile(configPath)
        if err != nil {
            return nil, "", err
        }
    } else {
        // なければ embed されたデフォルトを使う
        data = embeddedConfig
        _ = os.WriteFile(configPath, data, 0644)
    }

    var cfg AppConfig
    if err := json.Unmarshal(data, &cfg); err != nil {
        return nil, "", err
    }

    return &cfg, configPath, nil
}

