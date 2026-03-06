const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder } = require('discord.js');
const { getDbInstance } = require('../../db/shared_files_db');
const { config } = require('../../config/config');
const { sendLog } = require('../../utils/logger');

class GetFileHandler {
    constructor() {
        this.commandName = '获取文件';
        this.db = getDbInstance();
        this.requiredPermission = 0; // 所有人可用
    }

    async execute(interaction) {
        await interaction.deferReply({ flags: [64] });

        try {
            const fileId = interaction.options.getString('file_id').trim();
            const userId = interaction.user.id;

            // 1. 获取文件记录
            const fileRecord = await this.db.getFileRecord(fileId);
            if (!fileRecord) {
                return await interaction.editReply({ content: '❌ 找不到该文件，请检查文件ID是否正确。' });
            }

            // 2. 检查每日下载限制
            const dailyLimit = config.get('bot_config.file_share.daily_download_limit', 75);
            const canDownload = await this.db.checkAndUpdateDownloadLimit(userId, dailyLimit);
            if (!canDownload) {
                return await interaction.editReply({ content: `❌ 您今天的下载次数已达上限 (${dailyLimit} 次)，请明天再来！` });
            }

            // 3. 检查点赞条件
            if (fileRecord.req_reaction) {
                let hasReacted = false;
                try {
                    if (interaction.channel?.isThread()) {
                        const starterMsg = await interaction.channel.fetchStarterMessage().catch(() => null);
                        if (starterMsg?.reactions?.cache.size > 0) {
                            for (const reaction of starterMsg.reactions.cache.values()) {
                                const users = await reaction.users.fetch().catch(() => null);
                                if (users?.has(userId)) { hasReacted = true; break; }
                            }
                        }
                    } else if (fileRecord.source_message_id) {
                        const msg = await interaction.channel.messages.fetch(fileRecord.source_message_id).catch(() => null);
                        if (msg?.reactions?.cache.size > 0) {
                            for (const reaction of msg.reactions.cache.values()) {
                                const users = await reaction.users.fetch().catch(() => null);
                                if (users?.has(userId)) { hasReacted = true; break; }
                            }
                        }
                    }
                } catch (e) {
                    console.error('[GetFileHandler] 检查点赞失败:', e);
                }

                if (!hasReacted) {
                    return await interaction.editReply({ content: '⚠️ **下载被拒绝**\n发布者要求必须在原贴（首楼消息）点赞后才能下载附件。请点赞后再试！' });
                }
            }

            // 4. 处理验证码 / 条款确认流程
            if (fileRecord.req_terms || fileRecord.req_captcha || fileRecord.captcha_text) {
                await this.handleVerificationFlow(interaction, fileRecord);
            } else {
                await this.sendFile(interaction, fileRecord);
            }

        } catch (error) {
            console.error('[GetFileHandler] 获取文件出错:', error);
            await interaction.editReply({ content: '❌ 处理请求时发生内部错误。' }).catch(() => { });
        }
    }

    async handleVerificationFlow(interaction, fileRecord) {
        // 步骤 1：验证码（如有）
        if (fileRecord.req_captcha || fileRecord.captcha_text) {
            const passed = await this.doCaptchaStep(interaction, fileRecord);
            if (!passed) return;
        }

        // 步骤 2：条款确认（如有，最后一步）
        if (fileRecord.req_terms && fileRecord.terms_content) {
            const agreed = await this.doTermsStep(interaction, fileRecord);
            if (!agreed) return;
        }

        await this.sendFile(interaction, fileRecord);
    }

    async doCaptchaStep(interaction, fileRecord) {
        const label = fileRecord.captcha_text ? '输入提取口令' : '进行人机验证';
        const num1 = Math.floor(Math.random() * 10) + 1;
        const num2 = Math.floor(Math.random() * 10) + 1;
        const expectedAnswer = (num1 + num2).toString();

        const msg = await interaction.editReply({
            content: `🔐 **第一步：验证**\n请点击下方按钮完成验证后继续。`,
            embeds: [],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_captcha').setLabel(label).setStyle(ButtonStyle.Primary)
                )
            ]
        });

        return new Promise((resolve) => {
            const collector = msg.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 300000,
                max: 10
            });

            collector.on('collect', async i => {
                try {
                    if (i.customId !== 'btn_captcha') return;

                    const modal = new ModalBuilder()
                        .setCustomId('captcha_modal')
                        .setTitle(fileRecord.captcha_text ? '作品获取口令' : '人机验证');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('captcha_input')
                                .setLabel(fileRecord.captcha_text ? '请输入该作品的提取口令' : `请计算 ${num1} + ${num2} 的结果`)
                                .setStyle(TextInputStyle.Short)
                                .setRequired(true)
                        )
                    );
                    await i.showModal(modal);

                    try {
                        const submitted = await i.awaitModalSubmit({
                            time: 60000,
                            filter: s => s.user.id === interaction.user.id
                        });
                        const expected = fileRecord.captcha_text || expectedAnswer;
                        const userInput = submitted.fields.getTextInputValue('captcha_input').trim();

                        if (userInput === expected) {
                            await submitted.reply({ content: '✅ 验证通过！', flags: [64] });
                            collector.stop('passed');
                        } else {
                            await submitted.reply({ content: '❌ 错误，请重新尝试。', flags: [64] });
                        }
                    } catch (e) { /* 超时，不处理 */ }
                } catch (err) {
                    console.error('[GetFileHandler] doCaptchaStep error:', err);
                }
            });

            collector.on('end', (_, reason) => {
                if (reason === 'passed') {
                    resolve(true);
                } else {
                    interaction.editReply({ content: '⏰ 验证超时，请重新使用命令。', components: [] }).catch(() => { });
                    resolve(false);
                }
            });
        });
    }

    async doTermsStep(interaction, fileRecord) {
        const termsEmbed = new EmbedBuilder()
            .setTitle('⏳ 请阅读以下声明')
            .setDescription(fileRecord.terms_content)
            .setColor(0xffa500)
            .setFooter({ text: '阅读完毕后请点击下方"确定"按钮继续' });

        const msg = await interaction.editReply({
            content: '',
            embeds: [termsEmbed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_confirm_terms').setLabel('✅ 确定').setStyle(ButtonStyle.Success)
                )
            ]
        });

        return new Promise((resolve) => {
            const collector = msg.createMessageComponentCollector({
                filter: i => i.user.id === interaction.user.id,
                time: 300000,
                max: 1
            });

            collector.on('collect', async i => {
                if (i.customId === 'btn_confirm_terms') {
                    await i.update({ content: '✅ 已确认，正在准备资源...', embeds: [], components: [] });
                    resolve(true);
                }
            });

            collector.on('end', (collected, reason) => {
                if (reason !== 'limit') {
                    interaction.editReply({ content: '⏰ 超时，请重新使用命令。', embeds: [], components: [] }).catch(() => { });
                    resolve(false);
                }
            });
        });
    }

    async sendFile(interaction, fileRecord) {
        try {
            await interaction.editReply({ content: '✅ 验证通过，正在生成文件...', embeds: [], components: [] });

            const attachments = [];
            const primaryName = fileRecord.file_name?.split(', ')[0] || `file_${fileRecord.id}`;
            attachments.push(new AttachmentBuilder(fileRecord.file_url).setName(primaryName));

            if (fileRecord.extra_files) {
                let extra = [];
                try { extra = JSON.parse(fileRecord.extra_files); } catch (e) { /* ignore */ }
                for (const f of extra) {
                    attachments.push(new AttachmentBuilder(f.url).setName(f.name));
                }
            }

            const fileCount = attachments.length;
            await interaction.followUp({
                content: `✅ 文件加载成功！\n文件ID: \`${fileRecord.id}\`\n共 **${fileCount}** 个文件`,
                files: attachments,
                flags: [64]
            }).catch(err => console.error('[GetFileHandler] followUp failed:', err));

            sendLog(interaction.client, 'info', {
                module: '文件分享',
                operation: '获取文件',
                message: `用户 <@${interaction.user.id}> 下载了文件: ${fileRecord.file_name} (ID: ${fileRecord.id})`
            });

        } catch (error) {
            console.error('[GetFileHandler] 发送文件失败:', error);
            await interaction.editReply({ content: '❌ 文件地址可能已失效或拉取失败。' }).catch(() => { });
        }
    }
}

module.exports = new GetFileHandler();
