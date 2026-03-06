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
                                terms_content TEXT
                            )
                        `);

                        // 向后兼容：静默添加可能缺失的列
                        this.db.run(`ALTER TABLE shared_files ADD COLUMN captcha_text TEXT`, () => { });
                        this.db.run(`ALTER TABLE shared_files ADD COLUMN extra_files TEXT`, () => { });
                        this.db.run(`ALTER TABLE shared_files ADD COLUMN terms_content TEXT`, () => { });

                        this.db.run(`
                            CREATE TABLE IF NOT EXISTS user_downloads (
                                user_id TEXT,
                                download_date TEXT,
                                download_count INTEGER DEFAULT 0,
                                last_download_time TEXT,
                                PRIMARY KEY (user_id, download_date)
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
                (id, uploader_id, file_name, file_url, upload_time, source_message_id, req_reaction, req_captcha, req_terms, captcha_text, extra_files, terms_content) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
     * 检查并更新用户的每日下载次数
     * @returns {boolean} true 表示允许下载，false 表示超过限制
     */
    async checkAndUpdateDownloadLimit(userId, limit = 75) {
        await this.initDB();
        return new Promise((resolve, reject) => {
            const today = new Date().toISOString().split('T')[0];

            this.db.get(
                `SELECT download_count FROM user_downloads WHERE user_id = ? AND download_date = ?`,
                [userId, today],
                (err, row) => {
                    if (err) return reject(err);

                    if (row) {
                        if (row.download_count >= limit) {
                            resolve(false); // 超过限制
                        } else {
                            this.db.run(
                                `UPDATE user_downloads SET download_count = download_count + 1, last_download_time = ? WHERE user_id = ? AND download_date = ?`,
                                [new Date().toISOString(), userId, today],
                                (updateErr) => {
                                    if (updateErr) reject(updateErr);
                                    else resolve(true);
                                }
                            );
                        }
                    } else {
                        this.db.run(
                            `INSERT INTO user_downloads (user_id, download_date, download_count, last_download_time) VALUES (?, ?, 1, ?)`,
                            [userId, today, new Date().toISOString()],
                            (insertErr) => {
                                if (insertErr) reject(insertErr);
                                else resolve(true);
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
                else resolve(this.changes > 0);
            });
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
