const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const https = require('https');
const forumPanelHandler = require('./forum_panel_handler');
const { getDbInstance } = require('../../db/shared_files_db');

// 存储活跃的向导会话状态（内存）
const wizardStates = new Map();

class UploadWizardHandler {
    constructor() {
        this.db = getDbInstance();
    }

    /** 初始化状态并发送向导面板 */
    async startWizard(interaction) {
        const stateId = interaction.id;

        // 解析来自斜杠命令的可选参数
        let initialFileUrl = null;
        let initialFileName = null;
        let initialMode = 0;
        let initialCaptcha = null;
        let initialTerms = false;

        if (interaction.isCommand && interaction.isCommand()) {
            const attachment = interaction.options.getAttachment?.('file');
            if (attachment) {
                initialFileUrl = attachment.url;
                initialFileName = attachment.name;
            }
            if (interaction.options.getString?.('req_reaction') === 'true') initialMode = 1;
            const captchaText = interaction.options.getString?.('captcha_text');
            if (captchaText?.trim().length > 0) initialCaptcha = captchaText.trim();
            else if (interaction.options.getString?.('req_captcha') === 'true') initialCaptcha = '默认验证码';
            if (interaction.options.getString?.('req_terms') === 'true') initialTerms = true;
        }

        wizardStates.set(stateId, {
            mode: initialMode,         // 0: 无限制, 1: 点赞, 2: 点赞或回复
            captcha: initialCaptcha,   // string | null
            daily_limit: false,
            terms_enabled: initialTerms,
            terms_content: initialTerms ? '（请点击"输入声明"按钮修改内容）' : null,
            file_url: initialFileUrl,
            file_name: initialFileName,
            files: null,
            file_content_type: null,
        });

        const messagePayload = this.buildWizardPayload(stateId);

        if (interaction.deferred || interaction.replied) {
            await interaction.followUp({ ...messagePayload, flags: [64] });
        } else {
            await interaction.reply({ ...messagePayload, flags: [64] });
        }
    }

    buildWizardPayload(stateId) {
        const state = wizardStates.get(stateId);
        if (!state) return { content: '❌ 会话已过期，请重新使用命令。', components: [] };

        const modeLabel = state.mode === 0 ? '无限制' : (state.mode === 1 ? '点赞' : '点赞或回复');

        const embed = new EmbedBuilder()
            .setTitle('📦 作品发布面板')
            .setColor(0x2f3136)
            .setDescription(
                `**获取作品需求**\n当前模式: **${modeLabel}**\n\n` +
                `**提取码**\n` +
                `可设置下载密码，需要用户输入正确口令才能获取。\n` +
                `⚠️ 开头/结尾的空格将被自动清理\n\n` +
                `**获取次数设置**\n` +
                `当日下载次数耗尽时是否仍可获取本作品？\n` +
                `当前设置: ${state.daily_limit ? '**每日限定**：耗尽后不可获取' : '**开放分享**：耗尽后仍可获取'}\n\n` +
                `**作者声明**\n` +
                `当前状态: **${state.terms_enabled ? '已启用' : '已关闭'}**\n` +
                `> 下载前将先展示声明，要求用户二次确认\n\n` +
                `**当前声明内容:**\n${state.terms_content ?? '已禁用'}\n\n` +
                `**当前附件:**\n${state.file_name ? `✅ 已添加: **${state.file_name}**` : '❌ 未添加'}`
            )
            .setFooter({ text: '所有设置配置完成后，点击"发布"将文件公开。' });

        if (state.file_url && state.file_content_type?.startsWith('image/')) {
            embed.setImage(state.file_url);
        }

        // Row 1: 获取模式
        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`wiz_mode_0:${stateId}`).setLabel('☀️ 无限制').setStyle(state.mode === 0 ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`wiz_mode_1:${stateId}`).setLabel('❤️ 点赞').setStyle(state.mode === 1 ? ButtonStyle.Danger : ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`wiz_mode_2:${stateId}`).setLabel('🎁 点赞或回复').setStyle(state.mode === 2 ? ButtonStyle.Primary : ButtonStyle.Secondary)
        );

        // Row 2: 提取码 & 次数限制
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`wiz_captcha:${stateId}`)
                .setLabel(state.captcha !== null ? `# 提取码: ${state.captcha}` : '# 提取码: 已关闭')
                .setStyle(state.captcha !== null ? ButtonStyle.Success : ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`wiz_limit_0:${stateId}`)
                .setLabel('🎀 开放分享')
                .setStyle(!state.daily_limit ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`wiz_limit_1:${stateId}`)
                .setLabel('🏷️ 每日限定')
                .setStyle(state.daily_limit ? ButtonStyle.Danger : ButtonStyle.Secondary)
        );

        // Row 3: 作者声明
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`wiz_terms_on:${stateId}`)
                .setLabel('🔔 启用')
                .setStyle(state.terms_enabled ? ButtonStyle.Success : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`wiz_terms_off:${stateId}`)
                .setLabel('🔕 关闭')
                .setStyle(!state.terms_enabled ? ButtonStyle.Danger : ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId(`wiz_terms_input:${stateId}`)
                .setLabel('📝 输入声明')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!state.terms_enabled)
        );

        // Row 4: 文件操作
        const row4 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`wiz_file:${stateId}`)
                .setLabel(state.file_name ? '🔁 更改作品' : '➕ 添加作品')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId(`wiz_submit:${stateId}`)
                .setLabel('📩 发布')
                .setStyle(ButtonStyle.Success)
                .setDisabled(!state.file_name),
            new ButtonBuilder()
                .setCustomId(`wiz_cancel:${stateId}`)
                .setLabel('⚠️ 取消')
                .setStyle(ButtonStyle.Danger)
        );

        return { content: '', embeds: [embed], components: [row1, row2, row3, row4] };
    }

    async handleButton(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('wiz_')) return false;

        // 启动向导
        if (customId === 'wiz_start') {
            await this.startWizard(interaction);
            return true;
        }

        const parts = customId.split(':');
        const action = parts[0];
        const stateId = parts[1];

        const state = wizardStates.get(stateId);
        if (!state) {
            return await interaction.reply({ content: '❌ 该面板已失效，请重新使用命令。', flags: [64] });
        }

        // 状态修改
        if (action === 'wiz_mode_0') state.mode = 0;
        else if (action === 'wiz_mode_1') state.mode = 1;
        else if (action === 'wiz_mode_2') state.mode = 2;
        else if (action === 'wiz_limit_0') state.daily_limit = false;
        else if (action === 'wiz_limit_1') state.daily_limit = true;
        else if (action === 'wiz_terms_on') state.terms_enabled = true;
        else if (action === 'wiz_terms_off') { state.terms_enabled = false; state.terms_content = null; }

        // 提取码 Modal
        if (action === 'wiz_captcha') {
            const modal = new ModalBuilder()
                .setCustomId(`wiz_modal_captcha:${stateId}`)
                .setTitle('设置提取码（留空为关闭）');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('captcha_input')
                        .setLabel('提取码 / 密码')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(false)
                        .setValue(state.captcha || '')
                )
            );
            return await interaction.showModal(modal);
        }

        // 声明 Modal
        if (action === 'wiz_terms_input') {
            const modal = new ModalBuilder()
                .setCustomId(`wiz_modal_terms:${stateId}`)
                .setTitle('作者声明内容');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('terms_input')
                        .setLabel('请输入声明（同意后才可下载）')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                        .setValue(state.terms_content || '')
                )
            );
            return await interaction.showModal(modal);
        }

        // 文件上传 — 使用 Discord 原生 FileUpload 组件（通过原始 API）
        if (action === 'wiz_file') {
            const modalData = {
                title: '上传作品',
                custom_id: `wiz_modal_file:${stateId}`,
                components: [
                    {
                        type: 18, // ComponentType.LABEL
                        label: '请选择文件',
                        description: '支持最多 10 个文件，单个文件上限 100 MB',
                        component: {
                            type: 19, // ComponentType.FILE_UPLOAD
                            custom_id: 'file_upload_input',
                            required: true,
                            max_values: 10
                        }
                    }
                ]
            };

            // 绕过 discord.js，直接调用 Discord API 发送 flags: 32768 的模态框
            await new Promise((resolve, reject) => {
                const body = JSON.stringify({ type: 9, data: modalData });
                const req = https.request({
                    hostname: 'discord.com',
                    path: `/api/v10/interactions/${interaction.id}/${interaction.token}/callback`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Content-Length': Buffer.byteLength(body),
                        'User-Agent': 'DiscordBot (file-share-bot, 1.0)'
                    }
                }, (res) => {
                    let data = '';
                    res.on('data', chunk => { data += chunk; });
                    res.on('end', () => {
                        console.log(`[UploadWizard] Discord API 响应: ${res.statusCode}`);
                        if (data) console.log(`[UploadWizard] Body: ${data}`);
                        resolve();
                    });
                });
                req.on('error', e => { console.error('[UploadWizard] HTTPS 错误:', e); reject(e); });
                req.write(body);
                req.end();
            });
            interaction.replied = true;
            return;
        }

        // 取消
        if (action === 'wiz_cancel') {
            wizardStates.delete(stateId);
            return await interaction.update({ content: '已取消发布。', embeds: [], components: [] });
        }

        // 发布
        if (action === 'wiz_submit') {
            if (!state.file_url) {
                return await interaction.reply({ content: '❌ 必须先添加作品附件！', flags: [64] });
            }

            await interaction.deferUpdate();

            try {
                const fileId = await this.db.getNextFileId();
                const sourceMessageId = interaction.channelId;

                const fileData = {
                    id: fileId,
                    uploader_id: interaction.user.id,
                    file_name: state.file_name || `Published_File_${fileId}`,
                    file_url: state.file_url,
                    extra_files: (state.files && state.files.length > 1)
                        ? state.files.slice(1).map(f => ({ url: f.url, name: f.name }))
                        : null,
                    upload_time: new Date().toISOString(),
                    source_message_id: sourceMessageId,
                    req_reaction: state.mode > 0,
                    req_captcha: state.captcha !== null,
                    req_terms: state.terms_enabled,
                    captcha_text: state.captcha,
                    terms_content: state.terms_content || null
                };

                await this.db.saveFileRecord(fileData);

                // 在当前频道发送公开下载面板
                const channel = interaction.channel;
                const publicMessage = await channel.send('正在生成作品发布处...');
                await forumPanelHandler.convertToPublicPanel({ message: publicMessage }, fileData);

                wizardStates.delete(stateId);
                await interaction.editReply({
                    content: `✅ 作品已成功发布！\n文件ID: \`${fileId}\``,
                    embeds: [],
                    components: []
                });

            } catch (err) {
                console.error('[UploadWizard] 发布错误:', err);
                await interaction.followUp({ content: '❌ 保存时发生数据库错误。', flags: [64] });
            }
            return;
        }

        // 普通状态更新
        await interaction.update(this.buildWizardPayload(stateId));
        return true;
    }

    async handleModalSubmit(interaction) {
        const customId = interaction.customId;
        if (!customId.startsWith('wiz_modal_')) return false;

        const parts = customId.split(':');
        const action = parts[0];
        const stateId = parts[1];

        const state = wizardStates.get(stateId);
        if (!state) {
            return await interaction.reply({ content: '❌ 该面板已失效，请重新使用命令。', flags: [64] });
        }

        if (action === 'wiz_modal_captcha') {
            const input = interaction.fields.getTextInputValue('captcha_input').trim();
            state.captcha = input.length > 0 ? input : null;

        } else if (action === 'wiz_modal_terms') {
            const input = interaction.fields.getTextInputValue('terms_input').trim();
            state.terms_content = input.length > 0 ? input : null;
            if (state.terms_content) state.terms_enabled = true;

        } else if (action === 'wiz_modal_file') {
            // 尝试读取 FileUpload 附件（discord.js 14.25+）
            let uploadedCollection = null;
            try {
                uploadedCollection = interaction.fields.getUploadedFiles('file_upload_input', false);
            } catch (e) {
                console.log('[UploadWizard] getUploadedFiles 失败:', e.message);
            }

            if (uploadedCollection?.size > 0) {
                state.files = [];
                for (const [, att] of uploadedCollection) {
                    state.files.push({ url: att.url, name: att.name, contentType: att.contentType ?? null });
                }
                state.file_url = state.files[0].url;
                state.file_name = state.files.map(f => f.name).join(', ');
                state.file_content_type = state.files[0].contentType;
                console.log(`[UploadWizard] 已读取 ${state.files.length} 个文件: ${state.file_name}`);
            } else {
                // Fallback：从原始 interaction data 读取
                const rawData = interaction.data;
                if (rawData?.resolved?.attachments) {
                    const attachmentMap = rawData.resolved.attachments;
                    state.files = Object.values(attachmentMap).map(att => ({
                        url: att.url,
                        name: att.filename || att.url.split('/').pop(),
                        contentType: att.content_type ?? null
                    }));
                    state.file_url = state.files[0]?.url;
                    state.file_name = state.files.map(f => f.name).join(', ');
                    state.file_content_type = state.files[0]?.contentType;
                    console.log(`[UploadWizard] 从 raw 读取 ${state.files.length} 个文件: ${state.file_name}`);
                } else {
                    console.log('[UploadWizard] 未找到上传文件');
                }
            }
        }

        await interaction.update(this.buildWizardPayload(stateId));
        return true;
    }
}

module.exports = new UploadWizardHandler();
