package main
// JS側で確実に受け取るための構造体
type DiffFileInfo struct {
	FileName  string `json:"fileName"`  // test-project.clip.2025...diff が入る
	FilePath  string `json:"filePath"`  // フルパスが入る
	Timestamp string `json:"timestamp"` // 2025... 部分が入る
	FileSize int64   `json:"fileSize"`
}
