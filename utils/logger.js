const { EmbedBuilder } = require('discord.js');
const { config } = require('../config/config');

/**
 * 发送日志消息到配置的日志频道
 * @param {import('discord.js').Client} client
 * @param {string} level  - 'info' | 'success' | 'warning' | 'error'
 * @param {object} details
 * @param {string} details.module
 * @param {string} details.operation
 * @param {string} details.message
 */
async function sendLog(client, level, details) {
    const { module, operation, message } = details;
    const logChannelId = config.get('bot_config.logger.log_channel_id');
    const levelInfo = config.get(`bot_config.logger.log_levels.${level}`);

    if (!logChannelId || !levelInfo) {
        // 日志配置不完整时仅输出到控制台
        console.log(`[logger][${level}] [${module}] ${operation}: ${message}`);
        return;
    }

    try {
        const channel = await client.channels.fetch(logChannelId).catch(() => null);
        if (!channel) {
            console.error(`[logger] 找不到日志频道，ID: ${logChannelId}`);
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle(levelInfo.name || '日志')
            .setColor(levelInfo.color || '#ffffff')
            .addFields(
                { name: '模块', value: module, inline: true },
                { name: '操作', value: operation, inline: true },
                { name: '信息', value: message, inline: false }
            )
            .setTimestamp();

        await channel.send({ embeds: [embed] });
    } catch (error) {
        console.error('[logger] 发送日志时出错:', error);
    }
}

module.exports = { sendLog };
