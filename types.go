package main
// JS側で確実に受け取るための構造体
type DiffFileInfo struct {
	FileName  string `json:"fileName"`  // test-project.clip.2025...diff が入る
	FilePath  string `json:"filePath"`  // フルパスが入る
	Timestamp string `json:"timestamp"` // 2025... 部分が入る
	FileSize int64   `json:"fileSize"`
}

// BackupItem は履歴リストに表示する各ファイルの情報を保持します
type BackupItem struct {
	FileName  string `json:"fileName"`
	FilePath  string `json:"filePath"`
	Timestamp string `json:"timestamp"`
	FileSize  int64  `json:"FileSize"`
	Generation   int    `json:"generation"`   // 世代番号
}


// GenerationManager 世代管理を司る構造体
type GenerationManager struct {
	BackupRoot string  // cg_backup_元ファイル名/ のパス
	Threshold  float64 // ベース更新の閾値 (例: 0.8 = 80%)
}

// BackupGenInfo 現在の世代情報
type BackupGenInfo struct {
	DirPath string
	BaseIdx int
}

