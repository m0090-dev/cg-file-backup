import { 
    i18n, 
    tabs, 
    recentFiles, 
    getActiveTab, 
    formatSize,
    saveCurrentSession,
    addToRecentFiles
} from './state';

// tags.json のパスを取得
export async function getTagsFilePath() {
    const configDir = await window.go.main.App.GetConfigDir();
    return configDir + "/tags.json"; // 簡易結合（filepath.Joinの代わり）
}

// 定型文を読み込む
export async function LoadTags() {
    const path = await getTagsFilePath();
    const content = await window.go.main.App.ReadTextFile(path);
    if (!content) return ["ラフ", "線画", "塗り", "修正"]; // 初期値
    try {
        return JSON.parse(content);
    } catch (e) {
        return ["ラフ", "線画", "塗り", "修正"];
    }
}

// 定型文を保存する
export async function SaveTags(tags) {
    const path = await getTagsFilePath();
    await window.go.main.App.WriteTextFile(path, JSON.stringify(tags));
}
/**
 * 再利用可能なメモ入力ダイアログを表示する
 * すべてのテキストはグローバルの i18n オブジェクトを参照します
 */
export async function showMemoDialog(initialText = "", onSave) {
    // 既存のダイアログがあれば削除
    const old = document.getElementById('memo-dialog-overlay');
    if (old) old.remove();

    // オーバーレイの作成
    const overlay = document.createElement('div');
    overlay.id = 'memo-dialog-overlay';
    overlay.className = 'memo-overlay';

    // 定型文の初期読み込み
    let tags = await LoadTags();

    // ダイアログのHTML構造
    // 翻訳項目: backupMemo, cancel, save
    overlay.innerHTML = `
        <div class="memo-dialog">
            <div class="memo-dialog-header"> ${i18n.backupMemo}</div>
            <div class="memo-tag-container">
                <div id="dialog-tag-list" style="display:inline-block;"></div>
                <button id="dialog-tag-add-btn" class="tag-add-btn" title="${i18n.addTagTitle || 'Add Tag'}">+</button>
            </div>
            <textarea id="dialog-memo-input" rows="3" placeholder="${i18n.memoPlaceholder || '...'}"></textarea>
            <div class="memo-dialog-footer">
                <button id="memo-cancel-btn" class="memo-btn-secondary">${i18n.cancel}</button>
                <button id="memo-save-btn" class="memo-btn-primary">${i18n.save}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = overlay.querySelector('#dialog-memo-input');
    const tagList = overlay.querySelector('#dialog-tag-list');
    
    input.value = initialText;
    input.focus();

    // --- タグリストの描画と保存ロジック ---
    const renderTags = () => {
        tagList.innerHTML = '';
        tags.forEach((tag, index) => {
            const span = document.createElement('span');
            span.className = 'tag-item';
            span.innerText = `#${tag}`;
            
            // タグクリック：入力欄に追記
            span.onclick = (e) => {
                e.stopPropagation();
                const val = input.value.trim();
                input.value = val ? `${val} #${tag}` : `#${tag}`;
                input.focus();
            };

            // 右クリック：タグの削除と保存
            // 翻訳項目: confirmDeleteTag
            span.oncontextmenu = async (e) => {
                e.preventDefault();
                const confirmMsg = i18n.confirmDeleteTag ? i18n.confirmDeleteTag.replace('{tag}', tag) : `Delete #${tag}?`;
                if (confirm(confirmMsg)) {
                    tags.splice(index, 1);
                    await SaveTags(tags); // ここで tags.json を更新
                    renderTags();
                }
            };
            tagList.appendChild(span);
        });
    };

    // 初回表示
    renderTags();

    // --- 定型文の新規追加ボタン ---
    // 翻訳項目: enterNewTag
    overlay.querySelector('#dialog-tag-add-btn').onclick = async (e) => {
        e.stopPropagation();
        const newTag = prompt(i18n.enterNewTag);
        if (newTag && newTag.trim() !== "") {
            const cleanTag = newTag.replace(/^#/, "").trim();
            if (!tags.includes(cleanTag)) {
                tags.push(cleanTag);
                await SaveTags(tags); // ここで tags.json を更新
                renderTags();
            }
        }
    };

    // --- ダイアログのボタン操作 ---
    overlay.querySelector('#memo-save-btn').onclick = () => {
        if (onSave) onSave(input.value.trim());
        overlay.remove();
    };

    overlay.querySelector('#memo-cancel-btn').onclick = () => overlay.remove();

    // 外側クリックで閉じる
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
}
