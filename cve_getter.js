const axios = require('axios');
const mysql = require('mysql2/promise');

// 設定資料庫連線
const pool = mysql.createPool({
    host: '127.0.0.1',
    user: 'root',
    port: 3307,
    password: 'root',
    database: 'cves'
});

// 抓取資料的函數
async function fetchDataForMonth(year, month) {
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();

    const url = `https://services.nvd.nist.gov/rest/json/cves/2.0?lastModStartDate=${startDate}&lastModEndDate=${endDate}&cpeName=cpe:2.3:o:microsoft:windows_10:-:*:*:*:*:*:*:*`;

    try {
        const response = await axios.get(url);
        console.log(`資料獲取成功: ${month}月`);
        // 將資料寫入資料庫
        await insertData(response.data);
    } catch (error) {
        console.error(`資料獲取失敗: ${month}月, 錯誤: ${error}`);
    }
}

async function insertData(data) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        for (const item of data.vulnerabilities) {
            const cve = item.cve;
            await connection.query('INSERT INTO cves (id, sourceIdentifier, published, lastModified, vulnStatus) VALUES (?, ?, ?, ?, ?)', [
                cve.id,
                cve.sourceIdentifier,
                cve.published,
                cve.lastModified,
                cve.vulnStatus
            ]);
            for (const description of cve.descriptions) {
                await connection.query('INSERT INTO descriptions (cve_id, lang, value) VALUES (?, ?, ?)', [
                    cve.id,
                    description.lang,
                    description.value
                ]);
            }
            if (cve.metrics && cve.metrics.cvssMetricV31 && cve.metrics.cvssMetricV31.length > 0) {
                const metricsV3 = cve.metrics.cvssMetricV31[0];
                await connection.query('INSERT INTO metrics_v3 (cve_id, source, vectorString, attackVector, attackComplexity, privilegesRequired, userInteraction, scope, confidentialityImpact, integrityImpact, availabilityImpact, baseScore, baseSeverity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                    cve.id,
                    metricsV3.source,
                    metricsV3.cvssData.vectorString,
                    metricsV3.cvssData.attackVector,
                    metricsV3.cvssData.attackComplexity,
                    metricsV3.cvssData.privilegesRequired,
                    metricsV3.cvssData.userInteraction,
                    metricsV3.cvssData.scope,
                    metricsV3.cvssData.confidentialityImpact,
                    metricsV3.cvssData.integrityImpact,
                    metricsV3.cvssData.availabilityImpact,
                    metricsV3.cvssData.baseScore,
                    metricsV3.cvssData.baseSeverity
                ]);
            }
            for (const weakness of cve.weaknesses) {
                if (weakness.description && weakness.description.length > 0) {
                    await connection.query('INSERT INTO weaknesses (cve_id, source, description) VALUES (?, ?, ?)', [
                        cve.id,
                        weakness.source,
                        weakness.description[0].value
                    ]);
                }
            }
            for (const reference of cve.references) {
                await connection.query('INSERT INTO cve_references (cve_id, url, source, tags) VALUES (?, ?, ?, ?)', [
                    cve.id,
                    reference.url,
                    reference.source,
                    reference.tags ? reference.tags.join(',') : ''
                ]);
            }
        }
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}


// 循環遍歷 2022 年的每個月並在每次請求後暫停一分鐘
async function fetchAllData() {
    for (let month = 1; month <= 12; month++) {
        await fetchDataForMonth(2022, month);
        console.log(`完成 ${month} 月的資料抓取，現在暫停一分鐘...`);

        // 暫停一分鐘
        await new Promise(resolve => setTimeout(resolve, 60000));
    }
}

// 執行函數
fetchAllData();


