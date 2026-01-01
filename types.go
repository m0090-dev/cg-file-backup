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
}
