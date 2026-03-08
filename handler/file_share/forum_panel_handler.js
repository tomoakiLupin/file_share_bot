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

        // 加上延迟，避免收到 DiscordAPIError[40058]: Cannot message this thread until after the post author has sent an initial message.
        setTimeout(async () => {
            try {
                await this.sendAuthorPanel(thread, ownerId);
            } catch (err) {
                console.error('[ForumPanelHandler] 发送面板时出错:', err);
            }
        }, 2000);
    }

    /**
     * 构建并发送作者面板
     */
    async sendAuthorPanel(thread_or_interaction, ownerId, editMessage = null) {
        const embed = new EmbedBuilder()
            .setAuthor({ name: '📄 作品发布' })
            .setColor(0x00b0f4) // A nice bright color, like the user's screenshot had a green/blue stripe
            .setDescription(`本 BOT 为反自动化爬虫脚本的防盗措施，提供交互性作品发布功能\n作者可选择通过本BOT发布作品，用户通过交互性按钮获取作品进行下载\n如果选择不使用本BOT，也建议首楼尽量放置图片，贴内放置作品，以避免简易爬虫批量盗取首楼作品\n\n**作者可选获取作品方式:**\n\n- 无限制: 用户通过点击按钮即可下载作品. 无任何限制\n- 点赞: 用户对首楼进行反应后可下载作品\n- 点赞或评论: 用户对首楼进行反应或发送回复后可下载作品\n- 提取码: 作者在楼内布置提取码. 用户输入提取码后可下载作品\n\n- 注: Bot 会缓存作品文件，由于需要实现在贴内隐藏作品的情况下 Bot 向用户发送作品，Bot 需要先实现缓存作品相关文件才能实现再向用户发送，并且缓存会在删除发布处时同步删除，无法找回。\n- 如使用中有任何问题请前往: 反馈频道`);

        const actionRow1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fp_remove_panel:${ownerId}`).setLabel('⚠️ 从贴内移除本条消息').setStyle(ButtonStyle.Danger)
        );
        const actionRow2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`fp_disable_prompt:${ownerId}`).setLabel('🔕 之后将不再在您的帖子内自动弹出本消息').setStyle(ButtonStyle.Danger)
        );
        const actionRow3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('wiz_start').setLabel('📤 打开发布作品交互面板').setStyle(ButtonStyle.Success)
        );

        const payload = {
            content: `<@${ownerId}>`,
            embeds: [embed],
            components: [actionRow1, actionRow2, actionRow3]
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
    async convertToPublicPanel(fileRecord) {
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
                new ButtonBuilder().setCustomId(`fp_delete_work:${fileRecord.id}`).setLabel('⚠️ 移除本条发布处并删除作品').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId(`fp_republish:${fileRecord.uploader_id}`).setLabel('🆕 放置新的作品发布处').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`fp_pin_panel:${fileRecord.uploader_id}`).setLabel('📌 标注/取消标注本消息').setStyle(ButtonStyle.Primary)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`fp_get_work:${fileRecord.id}`).setLabel('🎁 获取作品').setStyle(ButtonStyle.Primary)
            )
        );

        return {
            components: [container],
            flags: [MessageFlags.IsComponentsV2]
        };
    }
}

module.exports = new ForumPanelHandler();
