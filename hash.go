package main
import (
	"os"
	"io"
	"path/filepath"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"time"
)
// ハッシュ計算ヘルパー
func  (a *App) CalculateSHA256(path string) (string, error) {
	f, err := os.Open(path)
	if err != nil { return "", err }
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil { return "", err }
	return hex.EncodeToString(h.Sum(nil)), nil
}

// 世代フォルダにチェックサムを書き込む
func (a *App) WriteChecksum(dir, workFile string, gen int) error {
	hash, err := a.CalculateSHA256(workFile)
	if err != nil { return err }

	data := map[string]interface{}{
		"base_hash": hash,
		"filename":  filepath.Base(workFile),
		"gen":       gen,
		"updated":   time.Now().Format(time.RFC3339),
	}
	
	file, _ := json.MarshalIndent(data, "", "  ")
	return os.WriteFile(filepath.Join(dir, "checksum.json"), file, 0644)
}

// IsGenerationCompatible は作業ファイルが指定した世代の .base と一致するか判定します
func (a *App) IsGenerationCompatible(workFile, genDirPath string) bool {
	checkPath := filepath.Join(genDirPath, "checksum.json")
	data, err := os.ReadFile(checkPath)
	if err != nil {
		return false
	}

	var meta struct {
		BaseHash string `json:"base_hash"`
	}
	if err := json.Unmarshal(data, &meta); err != nil {
		return false
	}

	// 現在の作業ファイルのハッシュを計算
	currentHash, err := a.CalculateSHA256(workFile)
	if err != nil {
		return false
	}

	return currentHash == meta.BaseHash
}
