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
    return prompt.replace(/* 正則表達式省略 */);
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
    while (true) {
        await updatePromptWithResult();
        // 簡單的延遲，防止無限循環過快消耗資源
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}

processPrompts();
