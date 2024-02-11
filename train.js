const mysql = require('mysql2/promise');
const axios = require('axios');

const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    port: 3307,
    password: 'root',
    database: 'cves'
});

function checkAndReplace(prompt) {
    return prompt.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}\u{2B50}\u{2B55}\u{2934}\u{2935}\u{2CE5}-\u{2CEA}\u{2E80}-\u{2E99}\u{2E9B}-\u{2EF3}\u{2F00}-\u{2FD5}\u{2FF0}-\u{2FFB}\u{3000}-\u{303F}\u{3200}-\u{33FF}\u{4DC0}-\u{4DFF}\u{A490}-\u{A4C6}]/gu, '');
}

async function updatePromptsWithResults() {
    const [prompts] = await pool.query('SELECT id, result FROM prompts WHERE trained_result IS NULL');

    for (const prompt of prompts) {
        let modifiedPrompt = checkAndReplace(prompt.result);
        let train_string = `請使用 字串中關鍵字:提示詞以下的字串進行訓練  ${modifiedPrompt}`;

        try {
            const response = await axios.get(`http://127.0.0.1:5500`, {
                params: {
                    text: train_string
                }
            });

            const result = checkAndReplace(response.data);
            await pool.query('UPDATE prompts SET trained_result = ? WHERE id = ?', [result, prompt.id]);
            console.log(`Result for prompt ${prompt.id} updated.`);
        } catch (error) {
            console.error(`Request failed for prompt ${prompt.id}:`, error);
        }
    }
}

updatePromptsWithResults();
