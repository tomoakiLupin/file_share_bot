const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SeparatorSpacingSize, MessageFlags, SectionBuilder } = require('discord.js');
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
        const container = new ContainerBuilder().setAccentColor(0x2B2D31);
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`<@${ownerId}>\n**📄 作品发布**`)
        );
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`本 BOT 提供交互性作品发布功能，支持上传文件并设置获取条件。\n\n**如何发布？**\n点击下方 **[📝 发布作品]** 按钮，系统将弹出可视化配置面板供您设置上传选项。\n\n*如果不需要自动弹出此面板，可点击"不再提示"或使用 \`/关闭自动提示\` 命令。*`)
        );

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('wiz_start').setLabel('发布作品').setEmoji('📝').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`fp_remove_panel:${ownerId}`).setLabel('移除消息').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`fp_disable_prompt:${ownerId}`).setLabel('不再提示').setEmoji('🔕').setStyle(ButtonStyle.Danger)
            )
        );

        const payload = {
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        };

        if (editMessage) {
            await editMessage.edit(payload);
        } else {
            if (typeof thread_or_interaction.send === 'function') {
                await thread_or_interaction.send(payload);
            } else if (thread_or_interaction.channel?.send) {
                await thread_or_interaction.channel.send(payload);
            } else if (typeof thread_or_interaction.followUp === 'function') {
                await thread_or_interaction.followUp(payload);
            }
        }
    }

    /**
     * 将作者私有面板转换为公开的"作品发布处"（用户可下载）
     */
    async convertToPublicPanel(context, fileRecord) {
        const conditionBold = fileRecord.req_reply ? '点赞并评论' : (fileRecord.req_reaction ? '点赞' : '无限制');
        const captchaText = fileRecord.req_captcha || fileRecord.captcha_text ? `\n> **提取码**: 寻找作者在贴内贴出的提取码` : '';

        const container = new ContainerBuilder().setAccentColor(0x2B2D31);

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent('**📍 作品发布处**')
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`请在此处交互获取本帖作品\n或者直接发送 **/获取作品** 来使用命令获取本帖内最新的发布处的作品`),
            new TextDisplayBuilder().setContent(`**• 前置条件: ${conditionBold}**\n> **无限制**: 可直接获取\n> **点赞**: 对帖子首楼点赞(任意反应)或在贴内回复(任意回复)\n> **点赞并评论**: 对帖子首楼点赞(任意反应)且在贴内回复(任意回复)${captchaText}`),
            new TextDisplayBuilder().setContent(`**• 分享模式: 开放分享**\n> **每日限定**: 用户的每日获取作品次数耗尽后**无法获取本作品**\n> **开放分享**: 用户的每日获取作品次数耗尽后**仍可获取本作品**`),
            new TextDisplayBuilder().setContent(`Tips:\n> 如果出现了点击按钮后再滑到最下面发现没有作品消息\n> 可以滑到最下面后输入 **/获取作品** 来使用命令获取最新发布处的作品`)
        );

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true).setSpacing(SeparatorSpacingSize.Small));

        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`**作者专属交互**\n\n| 作品ID: ${fileRecord.id}`)
        );

        container.addActionRowComponents(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fp_remove_panel:${fileRecord.uploader_id}`).setLabel('移除本条发布处').setEmoji('⚠️').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`fp_republish:${fileRecord.uploader_id}`).setLabel('放置新的作品发布处').setEmoji('🆕').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`fp_pin_panel:${fileRecord.uploader_id}`).setLabel('标注/取消标注本消息').setEmoji('📌').setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fp_get_work:${fileRecord.id}`).setLabel('获取作品').setEmoji('🎁').setStyle(ButtonStyle.Primary)
            )
        );

        await context.message.edit({
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        });
    }
}

module.exports = new ForumPanelHandler();
