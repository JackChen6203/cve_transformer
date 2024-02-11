const mysql = require('mysql2/promise');

// 設定資料庫連線
const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    port: 3307,
    password: 'root',
    database: 'cves'
});

async function generatePrompt(method, value) {
    // 移除句尾的 CVE 列表
    const cleanValue = value
        .replace(/This CVE ID is unique from CVE-\d{4}-\d{4,}/g, '') // 移除開頭的特定句子
        .replace(/, CVE-\d{4}-\d{4,}/g, '') // 移除結尾的 CVE 列表
        .trim();

    // 使用提供的方法和清理後的資料庫值結合生成提示詞
    return `請使用 ${method} 與 ${cleanValue} 結合組成提示詞`;
}

async function insertPrompts() {
    try {
        const [results] = await pool.query('SELECT cve_id, value FROM descriptions WHERE lang = "en"');

        const methods = ['Zero-shot', 'Retrieval Augmented Generation Prompting', 'Self-Consistency Prompting', 'Directional Stimulus Prompting'];

        for (let row of results) {
            for (let method of methods) {
                const prompt = await generatePrompt(method, row.value);
                // 確認 prompt 不為空再進行插入
                if (prompt.trim().length > 0) {
                    const insertQuery = `INSERT INTO prompts (cve_id, method, prompt, lang) VALUES (?, ?, ?, 'en')`;
                    await pool.query(insertQuery, [row.cve_id, method, prompt]);
                    console.log(`Prompt for ${row.cve_id} added.`);
                }
            }
        }
    } catch (error) {
        console.error(error);
    }
}

insertPrompts();
