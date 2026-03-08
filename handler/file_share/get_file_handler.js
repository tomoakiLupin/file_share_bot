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

            // 特权：如果当前用户是该文件的发布者，则无视所有限制，直接放行
            const dailyLimit = config.get('bot_config.file_share.daily_download_limit', 75);
            
            if (userId === fileRecord.uploader_id) {
                return await this.sendFile(interaction, fileRecord, { remaining: '不限', limit: dailyLimit });
            }

            // 2. 检查每日下载限制
            const downloadStatus = await this.db.checkAndUpdateDownloadLimit(userId, fileRecord.id, dailyLimit);
            if (!downloadStatus.allowed) {
                return await interaction.editReply({ content: `❌ 您今天的下载次数已达上限 (${dailyLimit} 次)，请明天再来！` });
            }

            // 3. 检查点赞/评论条件
            if (fileRecord.req_reaction || fileRecord.req_reply) {
                let hasReacted = false;
                let hasReplied = false;

                // 点赞检查
                try {
                    let targetMsg = null;
                    if (interaction.channel?.isThread()) {
                        targetMsg = await interaction.channel.fetchStarterMessage({ force: true }).catch(() => null);
                    } else if (fileRecord.source_message_id) {
                        targetMsg = await interaction.channel.messages.fetch(fileRecord.source_message_id).catch(() => null);
                    }

                    if (targetMsg?.reactions?.cache.size > 0) {
                        for (const reaction of targetMsg.reactions.cache.values()) {
                            // fetch() 会拉取最新点赞用户列表
                            const users = await reaction.users.fetch().catch(() => null);
                            if (users?.has(userId)) { hasReacted = true; break; }
                        }
                    }
                } catch (e) {
                    console.error('[GetFileHandler] 检查点赞失败:', e);
                }

                // 回复检查
                if (fileRecord.req_reply) {
                    try {
                        if (interaction.channel?.isThread()) {
                            // Thread members API 不好判断是否删了评论，其实直接拉取用户在帖子里的最新消息比较稳
                            // 拉取这个频道里该作者发过的消息：
                            const msgs = await interaction.channel.messages.fetch({ limit: 100 }).catch(() => null);
                            if (msgs) {
                                // 找找看有没有非系统消息是这个用户发的
                                const userReply = msgs.find(m => m.author.id === userId && !m.system);
                                if (userReply) {
                                    hasReplied = true;
                                }
                            }
                        }
                    } catch (e) {
                        console.error('[GetFileHandler] 检查回复失败:', e);
                    }
                }

                if (fileRecord.req_reply) {
                    // 需要点赞且评论
                    if (!hasReacted && !hasReplied) {
                        return await interaction.editReply({ content: `⚠️ **下载被拒绝**\n发布者要求必须在**原贴首楼点赞**（任意反应）并且**进行评论**后才能下载附件。\n\n❌ 您当前**未点赞首楼**。\n❌ 您当前**未发表评论**。` });
                    } else if (!hasReacted) {
                        return await interaction.editReply({ content: `⚠️ **下载被拒绝**\n发布者要求必须在**原贴首楼点赞**（任意反应）并且**进行评论**后才能下载附件。\n\n❌ 您当前**未点赞首楼**。\n✅ 您已发表评论。` });
                    } else if (!hasReplied) {
                        return await interaction.editReply({ content: `⚠️ **下载被拒绝**\n发布者要求必须在**原贴首楼点赞**（任意反应）并且**进行评论**后才能下载附件。\n\n✅ 您已点赞首楼。\n❌ 您当前**未发表评论**。` });
                    }
                } else if (fileRecord.req_reaction) {
                    // 只需要点赞
                    if (!hasReacted) {
                        return await interaction.editReply({ content: '⚠️ **下载被拒绝**\n发布者要求必须在**原贴首楼点赞**（任意反应）后才能下载附件。请点赞后再试！' });
                    }
                }
            }

            // 4. 处理验证码 / 条款确认流程
            if (fileRecord.req_terms || fileRecord.req_captcha || fileRecord.captcha_text) {
                await this.handleVerificationFlow(interaction, fileRecord, downloadStatus);
            } else {
                await this.sendFile(interaction, fileRecord, downloadStatus);
            }

        } catch (error) {
            console.error('[GetFileHandler] 获取文件出错:', error);
            await interaction.editReply({ content: '❌ 处理请求时发生内部错误。' }).catch(() => { });
        }
    }

    async handleVerificationFlow(interaction, fileRecord, downloadStatus) {
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

        await this.sendFile(interaction, fileRecord, downloadStatus);
    }

    async doCaptchaStep(interaction, fileRecord) {
        if (!fileRecord.captcha_text) return true; // 安全回退

        const expectedAnswer = fileRecord.captcha_text;

        const msg = await interaction.editReply({
            content: `🔐 **获取作品需要口令**\n作者设置了额外的下载验证，请点击下方按钮输入提取口令后继续。`,
            embeds: [],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('btn_captcha').setLabel('输入提取口令').setStyle(ButtonStyle.Primary)
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
                        .setTitle('获取作品口令');
                    modal.addComponents(
                        new ActionRowBuilder().addComponents(
                            new TextInputBuilder()
                                .setCustomId('captcha_input')
                                .setLabel('请输入该作品的提取口令')
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
                        const userInput = submitted.fields.getTextInputValue('captcha_input').trim();

                        if (userInput === expectedAnswer) {
                            // 使用 update 而不是 reply 来替换模态框原貌，或者如果需要展示后续按钮，可以保持在单条消息
                            await submitted.update({ content: '✅ 口令正确，正在继续...', components: [] });
                            collector.stop('passed');
                        } else {
                            await submitted.reply({ content: '❌ 口令错误，请重新获取。', flags: [64] });
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

    async getFileSize(url) {
        const http = require('http');
        const https = require('https');
        return new Promise((resolve) => {
            const client = url.startsWith('https') ? https : http;
            const req = client.request(url, { method: 'HEAD' }, (res) => {
                const size = res.headers['content-length'];
                if (size) {
                    const kb = (parseInt(size) / 1024).toFixed(2);
                    resolve(`${kb} KB`);
                } else {
                    resolve('未知大小');
                }
            });
            req.on('error', () => resolve('未知大小'));
            req.setTimeout(3000, () => resolve('未知大小'));
            req.end();
        });
    }

    async sendFile(interaction, fileRecord, downloadStatus) {
        try {
            await interaction.editReply({ content: '✅ 验证通过，正在生成文件...', embeds: [], components: [] });

            const attachments = [];
            const primaryName = fileRecord.file_name?.split(', ')[0] || `file_${fileRecord.id}`;
            const primaryUrl = fileRecord.file_url;
            
            const allFiles = [{ name: primaryName, url: primaryUrl }];

            if (fileRecord.extra_files) {
                let extra = [];
                try { extra = JSON.parse(fileRecord.extra_files); } catch (e) { /* ignore */ }
                for (const f of extra) {
                    allFiles.push(f);
                }
            }
            
            let imagesDescription = '';
            let othersDescription = '';
            
            const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
            
            for (const file of allFiles) {
                attachments.push(new AttachmentBuilder(file.url).setName(file.name));
                const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                const sizeStr = await this.getFileSize(file.url);
                
                if (imageExts.includes(ext)) {
                    imagesDescription += `🖼️ ${file.name}\n**大小:** ${sizeStr}\n>>[点击下载](${file.url})<<\n\n`;
                } else {
                    othersDescription += `📄 ${file.name}\n**大小:** ${sizeStr}\n>>[点击下载](${file.url})<<\n\n`;
                }
            }

            const embed = new EmbedBuilder()
                .setTitle('🎈 获取作品')
                .setColor(0x2ecc71); // Green color matching screenshot
                
            let desc = `今日剩余可获取作品量: ${downloadStatus.remaining}/${downloadStatus.limit}\n`;
            desc += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
            
            if (imagesDescription) {
                desc += `**以下为图片附件:**\n> 右键或长按图片下载，或点击超链接下载\n\n${imagesDescription}`;
            }
            if (othersDescription) {
                desc += `**以下为非图片附件:**\n> 点击超链接下载\n\n${othersDescription}`;
            }
            
            embed.setDescription(desc.trim());
            embed.setFooter({ text: '如使用中有任何问题或建议请前往: 反馈频道' });

            await interaction.editReply({
                content: '',
                files: attachments,
                embeds: [embed],
                components: []
            }).catch(err => console.error('[GetFileHandler] editReply failed:', err));

            // Record the download event in the database for statistics
            await this.db.recordDownload(fileRecord.id, interaction.user.id).catch(e => console.error('[GetFileHandler] 记录下载统计失败:', e));

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
