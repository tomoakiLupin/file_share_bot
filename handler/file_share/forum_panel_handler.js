const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { config } = require('../../config/config');
const { getDbInstance } = require('../../db/shared_files_db');

class ForumPanelHandler {
    constructor() {
        this.db = getDbInstance();
    }

    /**
     * 鉴权：检查当前帖子是否在配置的论坛频道内
     * @param {Interaction|ThreadChannel} context 
     * @returns {string|null} 错误信息，通过则返回 null
     */
    async checkEligibility(context) {
        const isThread = context.isThread ? context.isThread() : context.channel?.isThread();
        if (!isThread) {
            return '该交互必须位于指定的论坛帖子内使用。';
        }

        const thread = context.isThread ? context : context.channel;
        const parentId = thread.parentId;

        const enabledChannelIds = config.get('bot_config.file_share.forum_channel_ids', []);

        if (!enabledChannelIds.includes(parentId)) {
            return '该命令只能在配置的文件分享论坛频道内使用。';
        }

        return null;
    }

    /**
     * 发送鉴权失败提示
     */
    async sendAuthFailed(interaction, reason) {
        const errorEmbed = new EmbedBuilder()
            .setTitle('⛔ 鉴权未通过')
            .setDescription(`**${reason}**`)
            .setColor(0xED4245);

        if (interaction.deferred || interaction.replied) {
            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], flags: [64] });
        }
    }

    /**
     * 新建帖子时触发，自动发送作者面板
     * @param {ThreadChannel} thread 
     */
    async handleThreadCreate(thread) {
        const authError = await this.checkEligibility(thread);
        if (authError) return;

        const ownerId = thread.ownerId;
        if (!ownerId) return;

        // 检查用户是否关闭了自动提示
        const disableAutoPrompt = await this.db.getUserPreference(ownerId);
        if (disableAutoPrompt) return;

        await this.sendAuthorPanel(thread, ownerId);
    }

    /**
     * 构建并发送作者面板
     */
    async sendAuthorPanel(thread_or_interaction, ownerId, editMessage = null) {
        const embed = new EmbedBuilder()
            .setTitle('📄 作品发布')
            .setDescription(
                `本 BOT 提供交互性作品发布功能，支持上传文件并设置获取条件。\n\n` +
                `**如何发布？**\n` +
                `点击下方 **[📝 发布作品]** 按钮，系统将弹出可视化配置面板供您设置上传选项。\n\n` +
                `*如果不需要自动弹出此面板，可点击"不再提示"或使用 \`/关闭自动提示\` 命令。*`
            )
            .setColor(0x2B2D31);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('wiz_start').setLabel('发布作品').setEmoji('📝').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`fp_remove_panel:${ownerId}`).setLabel('移除消息').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`fp_disable_prompt:${ownerId}`).setLabel('不再提示').setEmoji('🔕').setStyle(ButtonStyle.Danger)
        );

        if (editMessage) {
            await editMessage.edit({ content: `<@${ownerId}>`, embeds: [embed], components: [row] });
        } else {
            if (typeof thread_or_interaction.send === 'function') {
                await thread_or_interaction.send({ content: `<@${ownerId}>`, embeds: [embed], components: [row] });
            } else if (thread_or_interaction.channel?.send) {
                await thread_or_interaction.channel.send({ content: `<@${ownerId}>`, embeds: [embed], components: [row] });
            } else if (typeof thread_or_interaction.followUp === 'function') {
                await thread_or_interaction.followUp({ content: `<@${ownerId}>`, embeds: [embed], components: [row] });
            }
        }
    }

    /**
     * 将作者私有面板转换为公开的"作品发布处"（用户可下载）
     */
    async convertToPublicPanel(context, fileRecord) {
        let conditionText = '无限制：可直接获取';
        if (fileRecord.req_reaction) conditionText = '点赞：对帖子首楼点赞（任意反应）后获取';
        if (fileRecord.req_captcha || fileRecord.req_terms) conditionText = '验证：需完成验证码或确认声明';

        const embed = new EmbedBuilder()
            .setTitle('🎈 作品发布处')
            .setDescription(
                `请在此处交互获取本帖作品，或直接使用 \`/获取作品\` 命令。\n\n` +
                `*   **前置条件**: ${fileRecord.req_reaction ? '**点赞**' : '**无限制**'}\n` +
                `    *   ${conditionText}\n` +
                `*   **每日下载上限**: ${config.get('bot_config.file_share.daily_download_limit', 75)} 次\n\n` +
                `> 如点击按钮后未出现文件消息，可尝试滑到最下方后使用 \`/获取作品\` 命令`
            )
            .setColor(0x2B2D31)
            .setFooter({ text: `文件ID: ${fileRecord.id}` });

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fp_remove_panel:${fileRecord.uploader_id}`).setLabel('移除本条发布处').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`fp_republish:${fileRecord.uploader_id}`).setLabel('放置新的发布处').setEmoji('🆕').setStyle(ButtonStyle.Success)
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fp_get_work:${fileRecord.id}`).setLabel('获取作品').setEmoji('🎁').setStyle(ButtonStyle.Primary)
        );

        await context.message.edit({ content: '', embeds: [embed], components: [row1, row2] });
    }
}

module.exports = new ForumPanelHandler();
