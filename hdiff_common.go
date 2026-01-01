package main

import (
	"os"
	"path/filepath"
	"strings"
	"time"
)

func (a *App) GetHdiffList(workFile, customDir string) ([]DiffFileInfo, error) {
	targetDir := customDir
	if targetDir == "" { targetDir = DefaultBackupDir(workFile) }
	
	files, err := os.ReadDir(targetDir)
	if err != nil {
		if os.IsNotExist(err) { return []DiffFileInfo{}, nil }
		return nil, err
	}
	
	var list []DiffFileInfo
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(f.Name(), ".diff") {
			ts, _ := extractTimestampFromBackup(f.Name())
			list = append(list, DiffFileInfo{
				FileName:  f.Name(),
				FilePath:  filepath.Join(targetDir, f.Name()),
				Timestamp: ts,
			})
		}
	}
	return list, nil
}

func (a *App) BackupOrHdiff(workFile, customDir string) error {
	targetDir := customDir
	if targetDir == "" { targetDir = DefaultBackupDir(workFile) }
	if err := os.MkdirAll(targetDir, 0755); err != nil { return err }

	baseName := filepath.Base(workFile)
	baseFull := filepath.Join(targetDir, baseName+".base")

	if _, err := os.Stat(baseFull); os.IsNotExist(err) {
		return CopyFile(workFile, baseFull)
	}
	ts := time.Now().Format("20060102_150405")
	diffPath := filepath.Join(targetDir, baseName+"."+ts+".diff")
	return a.CreateHdiff(baseFull, workFile, diffPath)
}

func (a *App) ApplyHdiffWrapper(workFile, diffFile string) error {
	backupDir := filepath.Dir(diffFile)
	baseName := strings.Split(filepath.Base(diffFile), ".20")[0] + ".base"
	baseFull := filepath.Join(backupDir, baseName)
	if _, err := os.Stat(baseFull); os.IsNotExist(err) {
		baseFull = filepath.Join(backupDir, filepath.Base(workFile)+".base")
	}

	outPath := autoOutputPath(workFile)
	// 各OS版の ApplyHdiff を呼び出し
	return a.ApplyHdiff(baseFull, diffFile, outPath)
}
