const { REST, Routes } = require('discord.js');

class CommandService {
    constructor() {
        this.rest = null;
    }

    initialize(token) {
        this.rest = new REST().setToken(token);
    }

    async registerCommands(clientId, commands, guildIds) {
        if (!this.rest) {
            throw new Error('[command_service] 未初始化，请先调用 initialize()');
        }

        if (commands.length === 0) {
            console.log('[command_service] 没有命令需要注册');
            return;
        }

        try {
            // 清除旧的全局命令
            console.log('[command_service] 正在清除旧的全局斜杠命令...');
            await this.rest.put(Routes.applicationCommands(clientId), { body: [] });

            // 在每个指定服务器注册
            for (const guildId of guildIds) {
                try {
                    await this.rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
                    console.log(`[command_service] ✓ 在服务器 ${guildId} 成功注册 ${commands.length} 个命令`);
                } catch (error) {
                    console.error(`[command_service] ✗ 在服务器 ${guildId} 注册失败:`, error);
                }
            }
        } catch (error) {
            console.error('[command_service] 注册斜杠命令时出错:', error);
            throw error;
        }
    }
}

module.exports = CommandService;
