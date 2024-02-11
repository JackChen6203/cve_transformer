const mysql = require('mysql2/promise');
const axios = require('axios');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    port: process.env.DB_PORT,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE
});

function checkAndReplace(prompt) {
    return prompt.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2CE5}-\u{2CEA}\u{2E80}-\u{2E99}\u{2E9B}-\u{2EF3}\u{2F00}-\u{2FD5}\u{2FF0}-\u{2FFB}\u{3000}-\u{303F}\u{3200}-\u{33FF}\u{4DC0}-\u{4DFF}\u{A490}-\u{A4C6}]/gu, '');
}

async function resetUnprocessedPrompts() {
    try {
        const [result] = await pool.query('UPDATE prompts SET is_taken = 0 WHERE trained_result IS NULL AND is_taken != 0');
        console.log(`Reset ${result.affectedRows} unprocessed prompts.`);
    } catch (error) {
        console.error(`Error resetting unprocessed prompts:`, error);
    }
}

async function updatePromptWithResult() {
    // 使用事務來鎖定一條記錄
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
        // 嘗試選擇並鎖定一條記錄
        const [rows] = await connection.query('SELECT id, result FROM prompts WHERE trained_result IS NULL AND is_taken = 0 ORDER BY id LIMIT 1 FOR UPDATE');
        if (rows.length === 0) {
            await connection.release();
            console.log("No more prompts to process.");
            return;
        }

        const prompt = rows[0];
        await connection.query('UPDATE prompts SET is_taken = 1 WHERE id = ?', [prompt.id]);

        await connection.commit();
        await connection.release();

        // 處理記錄
        let modifiedPrompt = checkAndReplace(prompt.result);
        let train_string = `請使用 字串中關鍵字:提示詞以下的字串進行訓練  ${modifiedPrompt}`;

        const response = await axios.get(process.env.API_URL, {
            params: {
                text: train_string
            }
        });

        const result = checkAndReplace(response.data);
        await pool.query('UPDATE prompts SET trained_result = ?, is_taken = 0 WHERE id = ?', [result, prompt.id]);
        console.log(`Result for prompt ${prompt.id} updated.`);

    } catch (error) {
        await connection.rollback();
        await connection.release();
        console.error(`Error processing prompt:`, error);
    }
}

async function processPrompts() {
    await resetUnprocessedPrompts(); // 首先重置未處理的項目
    while (true) {
        await updatePromptWithResult();
        await new Promise(resolve => setTimeout(resolve, 1000)); // 簡單的延遲
    }
}

processPrompts();
