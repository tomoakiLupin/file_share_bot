const fs = require('fs');
const path = require('path');

class ConfigLoader {
    constructor(configDir = path.join(__dirname, '../data/config')) {
        this.configDir = configDir;
        this.config = {};
        this.loadConfigs();
    }

    loadConfigs() {
        const configFiles = [
            'bot_config.json',
        ];

        configFiles.forEach(filename => {
            const filepath = path.join(this.configDir, filename);
            if (fs.existsSync(filepath)) {
                try {
                    const content = JSON.parse(fs.readFileSync(filepath, 'utf8'));
                    const configKey = filename.replace('.json', '');
                    this.config[configKey] = content;
                    console.log(`[config] ✓ 已加载配置: ${filename}`);
                } catch (error) {
                    console.error(`[config] ✗ 加载配置失败: ${filename}`, error.message);
                }
            } else {
                console.warn(`[config] ⚠ 配置文件不存在: ${filepath}`);
            }
        });
    }

    get(dotPath, defaultValue = null) {
        const parts = dotPath.split('.');
        let current = this.config;

        for (const part of parts) {
            if (current && typeof current === 'object' && part in current) {
                current = current[part];
            } else {
                return defaultValue;
            }
        }

        return current;
    }

    has(dotPath) {
        return this.get(dotPath) !== null;
    }

    getAll() {
        return this.config;
    }

    reload() {
        this.config = {};
        this.loadConfigs();
    }
}

// 单例模式
let configInstance = null;

function getConfig() {
    if (!configInstance) {
        configInstance = new ConfigLoader();
    }
    return configInstance;
}

module.exports = {
    ConfigLoader,
    getConfig,
    config: getConfig()
};
