package main
import (
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"time"
)
// GetLatestGeneration 最新の baseN フォルダを特定する
func (m *GenerationManager) GetLatestGeneration() (*BackupGenInfo, error) {
	entries, err := os.ReadDir(m.BackupRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // まだフォルダがない
		}
		return nil, err
	}

	// base_連番_タイムスタンプ 形式にマッチする正規表現
	re := regexp.MustCompile(`^base(\d+)_(\d+)$`)
	var latestIdx = -1
	var latestDir string

	for _, entry := range entries {
		if entry.IsDir() {
			matches := re.FindStringSubmatch(entry.Name())
			if len(matches) == 3 {
				idx, _ := strconv.Atoi(matches[1])
				if idx > latestIdx {
					latestIdx = idx
					latestDir = entry.Name()
				}
			}
		}
	}

	if latestIdx == -1 {
		return nil, nil
	}

	return &BackupGenInfo{
		DirPath: filepath.Join(m.BackupRoot, latestDir),
		BaseIdx: latestIdx,
	}, nil
}

// ShouldRotate 新しい世代に切り替えるべきか判定する
func (m *GenerationManager) ShouldRotate(basePath, diffPath string) bool {
	baseStat, err := os.Stat(basePath)
	if err != nil {
		return false
	}
	diffStat, err := os.Stat(diffPath)
	if err != nil {
		return false
	}

	// 差分サイズがベースサイズの Threshold 倍を超えているか
	return float64(diffStat.Size()) > float64(baseStat.Size())*m.Threshold
}


// 最新の世代フォルダ(baseN_...)を探す関数
func (a *App) FindLatestBaseDir(root string) (string, int) {
	entries, _ := os.ReadDir(root)
	re := regexp.MustCompile(`^base(\d+)_`)
	maxIdx := 0
	latestPath := ""

	for _, e := range entries {
		if e.IsDir() {
			matches := re.FindStringSubmatch(e.Name())
			if len(matches) == 2 {
				idx, _ := strconv.Atoi(matches[1])
				if idx >= maxIdx {
					maxIdx = idx
					latestPath = filepath.Join(root, e.Name())
				}
			}
		}
	}
	return latestPath, maxIdx
}
// 最新の世代フォルダを取得（なければ作成）
func (a *App) ResolveGenerationDir(root, workFile string) (string, int, error) {
	entries, _ := os.ReadDir(root)
	re := regexp.MustCompile(`^base(\d+)_`)
	maxIdx := 0
	var latestDir string

	for _, e := range entries {
		if e.IsDir() {
			matches := re.FindStringSubmatch(e.Name())
			if len(matches) == 2 {
				idx, _ := strconv.Atoi(matches[1])
				if idx >= maxIdx {
					maxIdx = idx
					latestDir = filepath.Join(root, e.Name())
				}
			}
		}
	}

	// 世代が一つもない場合は初回作成
	if latestDir == "" {
		newPath, err := a.CreateNewGeneration(root, 1, workFile)
		return newPath, 1, err
	}
	return latestDir, maxIdx, nil
}

// 新しい世代フォルダを作成し、.base をコピーする
func (a *App) CreateNewGeneration(root string, idx int, workFile string) (string, error) {
	ts := time.Now().Format("20060102_150405")
	newDir := filepath.Join(root, fmt.Sprintf("base%d_%s", idx, ts))
	if err := os.MkdirAll(newDir, 0755); err != nil {
		return "", err
	}
	
	basePath := filepath.Join(newDir, filepath.Base(workFile)+".base")
	if err := CopyFile(workFile, basePath); err != nil {
		return "", err
	}
	return newDir, nil
}
