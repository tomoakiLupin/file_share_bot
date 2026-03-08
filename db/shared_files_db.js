const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class SharedFilesDB {
    constructor() {
        this.dbPath = path.join(__dirname, '../data/shared_files.sqlite');
        this.db = null;
    }

    async initDB() {
        if (this.db) return this.db;

        return new Promise((resolve, reject) => {
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    console.error('[SharedFilesDB] 无法连接到数据库:', err.message);
                    reject(err);
                } else {
                    console.log('[SharedFilesDB] 已连接到数据库:', this.dbPath);
                    this.db.serialize(() => {
                        this.db.run(`
                            CREATE TABLE IF NOT EXISTS shared_files (
                                id TEXT PRIMARY KEY,
                                uploader_id TEXT,
                                file_name TEXT,
                                file_url TEXT,
                                upload_time TEXT,
                                source_message_id TEXT,
                                req_reaction INTEGER DEFAULT 0,
                                req_captcha INTEGER DEFAULT 0,
                                req_terms INTEGER DEFAULT 0,
                                captcha_text TEXT,
                                extra_files TEXT,
                                terms_content TEXT,
                                req_reply INTEGER DEFAULT 0
                            )
                        `);

                        // 向后兼容：静默添加可能缺失的列
                        this.db.run(`ALTER TABLE shared_files ADD COLUMN captcha_text TEXT`, () => { });
                        this.db.run(`ALTER TABLE shared_files ADD COLUMN extra_files TEXT`, () => { });
                        this.db.run(`ALTER TABLE shared_files ADD COLUMN terms_content TEXT`, () => { });
                        this.db.run(`ALTER TABLE shared_files ADD COLUMN req_reply INTEGER DEFAULT 0`, () => { });

                        this.db.run(`
                            CREATE TABLE IF NOT EXISTS user_downloads (
                                user_id TEXT,
                                download_date TEXT,
                                download_count INTEGER DEFAULT 0,
                                last_download_time TEXT,
                                downloaded_files TEXT DEFAULT '[]',
                                PRIMARY KEY (user_id, download_date)
                            )
                        `);
                        
                        this.db.run(`ALTER TABLE user_downloads ADD COLUMN downloaded_files TEXT DEFAULT '[]'`, () => { });

                        this.db.run(`
                            CREATE TABLE IF NOT EXISTS file_downloads_log (
                                id INTEGER PRIMARY KEY AUTOINCREMENT,
                                file_id TEXT,
                                user_id TEXT,
                                timestamp TEXT
                            )
                        `);

                        this.db.run(`
                            CREATE TABLE IF NOT EXISTS user_preferences (
                                user_id TEXT PRIMARY KEY,
                                disable_auto_prompt INTEGER DEFAULT 0
                            )
                        `, (err) => {
                            if (err) reject(err);
                            else resolve(this.db);
                        });
                    });
                }
            });
        });
    }

    async saveFileRecord(data) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO shared_files 
                (id, uploader_id, file_name, file_url, upload_time, source_message_id, req_reaction, req_captcha, req_terms, captcha_text, extra_files, terms_content, req_reply) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);
            stmt.run(
                data.id,
                data.uploader_id,
                data.file_name,
                data.file_url,
                data.upload_time,
                data.source_message_id,
                data.req_reaction ? 1 : 0,
                data.req_captcha ? 1 : 0,
                data.req_terms ? 1 : 0,
                data.captcha_text || null,
                data.extra_files ? JSON.stringify(data.extra_files) : null,
                data.terms_content || null,
                data.req_reply ? 1 : 0,
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
            stmt.finalize();
        });
    }

    async getFileRecord(id) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            this.db.get(`SELECT * FROM shared_files WHERE id = ?`, [id], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * 检查并更新用户的每日下载次数，同一文件当日重复下载不扣次数
     * @returns {Object} { allowed: boolean, remaining: number, limit: number }
     */
    async checkAndUpdateDownloadLimit(userId, fileId, limit = 75) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];

            this.db.get(
                `SELECT download_count, downloaded_files FROM user_downloads WHERE user_id = ? AND download_date = ?`,
                [userId, today],
                (err, row) => {
                    if (err) return reject(err);

                    if (row) {
                        let downloadedFiles = [];
                        if (row.downloaded_files) {
                            try { downloadedFiles = JSON.parse(row.downloaded_files); } catch(e) {}
                        }
                        
                        if (downloadedFiles.includes(fileId.toString())) {
                            // Same file already verified today, don't deduct again
                            return resolve({ allowed: true, remaining: limit - row.download_count, limit: limit });
                        }

                        if (row.download_count >= limit) {
                            return resolve({ allowed: false, remaining: 0, limit: limit }); // over limit
                        }
                        
                        downloadedFiles.push(fileId.toString());
                        this.db.run(
                            `UPDATE user_downloads SET download_count = download_count + 1, last_download_time = ?, downloaded_files = ? WHERE user_id = ? AND download_date = ?`,
                            [new Date().toISOString(), JSON.stringify(downloadedFiles), userId, today],
                            (updateErr) => {
                                if (updateErr) reject(updateErr);
                                else resolve({ allowed: true, remaining: limit - (row.download_count + 1), limit: limit });
                            }
                        );
                    } else {
                        const downloadedFiles = [fileId.toString()];
                        this.db.run(
                            `INSERT INTO user_downloads (user_id, download_date, download_count, last_download_time, downloaded_files) VALUES (?, ?, 1, ?, ?)`,
                            [userId, today, new Date().toISOString(), JSON.stringify(downloadedFiles)],
                            (insertErr) => {
                                if (insertErr) reject(insertErr);
                                else resolve({ allowed: true, remaining: limit - 1, limit: limit });
                            }
                        );
                    }
                }
            );
        });
    }

    async getUserPreference(userId) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            this.db.get(`SELECT disable_auto_prompt FROM user_preferences WHERE user_id = ?`, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row ? row.disable_auto_prompt === 1 : false);
            });
        });
    }

    async setUserPreference(userId, disablePrompt) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            this.db.run(`
                INSERT INTO user_preferences (user_id, disable_auto_prompt) 
                VALUES (?, ?) 
                ON CONFLICT(user_id) DO UPDATE SET disable_auto_prompt = ?
            `, [userId, disablePrompt ? 1 : 0, disablePrompt ? 1 : 0], (err) => {
                if (err) reject(err);
                else resolve(true);
            });
        });
    }

    async getLatestFileBySourceMessage(sourceMessageId) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            this.db.get(
                `SELECT * FROM shared_files WHERE source_message_id = ? ORDER BY upload_time DESC LIMIT 1`,
                [sourceMessageId],
                (err, row) => {
                    if (err) reject(err);
                    else resolve(row);
                }
            );
        });
    }

    async getFilesBySourceMessage(sourceMessageId) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            this.db.all(
                `SELECT * FROM shared_files WHERE source_message_id = ? ORDER BY upload_time ASC`,
                [sourceMessageId],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows || []);
                }
            );
        });
    }

    async getNextFileId() {
        await this.initDB();
        return new Promise((resolve, reject) => {
            this.db.get(`SELECT MAX(CAST(id AS INTEGER)) as maxId FROM shared_files`, (err, row) => {
                if (err) {
                    reject(err);
                } else {
                    const nextId = (row && row.maxId !== null && !isNaN(row.maxId)) ? row.maxId + 1 : 0;
                    resolve(nextId.toString());
                }
            });
        });
    }

    async deleteFileRecord(id, userId, isAdmin = false) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            let sql = `DELETE FROM shared_files WHERE id = ?`;
            let params = [id];

            if (!isAdmin) {
                sql += ` AND uploader_id = ?`;
                params.push(userId);
            }

            this.db.run(sql, params, function (err) {
                if (err) reject(err);
                else {
                    // Optional: Clean up logs if file is deleted
                    // this.db.run(`DELETE FROM file_downloads_log WHERE file_id = ?`, [id], () => {});
                    resolve(this.changes > 0);
                }
            });
        });
    }

    async recordDownload(fileId, userId) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            this.db.run(
                `INSERT INTO file_downloads_log (file_id, user_id, timestamp) VALUES (?, ?, ?)`,
                [fileId, userId, new Date().toISOString()],
                (err) => {
                    if (err) reject(err);
                    else resolve(true);
                }
            );
        });
    }

    async getFileStats(fileId) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            // First get the latest 50 downloads
            this.db.all(
                `SELECT user_id, timestamp FROM file_downloads_log WHERE file_id = ? ORDER BY timestamp DESC LIMIT 50`,
                [fileId],
                (err, logs) => {
                    if (err) return reject(err);
                    
                    // Then get total count
                    this.db.get(
                        `SELECT COUNT(*) as total FROM file_downloads_log WHERE file_id = ?`,
                        [fileId],
                        (errCount, countRow) => {
                            if (errCount) return reject(errCount);
                            
                            resolve({
                                totalDownloads: countRow.total,
                                recentLogs: logs || []
                            });
                        }
                    );
                }
            );
        });
    }

    async getUserDownloadStats(userId) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            // First get the latest 15 downloaded files by this user
            this.db.all(
                `SELECT file_id, timestamp FROM file_downloads_log WHERE user_id = ? ORDER BY timestamp DESC LIMIT 15`,
                [userId],
                (err, logs) => {
                    if (err) return reject(err);
                    
                    // Then get total count across all time
                    this.db.get(
                        `SELECT COUNT(*) as total FROM file_downloads_log WHERE user_id = ?`,
                        [userId],
                        (errCount, countRow) => {
                            if (errCount) return reject(errCount);
                            
                            resolve({
                                totalDownloads: countRow.total,
                                recentLogs: logs || []
                            });
                        }
                    );
                }
            );
        });
    }
}

// 单例
let instance = null;

module.exports = {
    getDbInstance: () => {
        if (!instance) {
            instance = new SharedFilesDB();
        }
        return instance;
    }
};
