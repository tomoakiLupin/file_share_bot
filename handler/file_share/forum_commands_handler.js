const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const forumPanelHandler = require('./forum_panel_handler');
const { getDbInstance } = require('../../db/shared_files_db');

class ForumCommandsHandler {
    constructor() {
        this.db = getDbInstance();
    }

    // ========== SLASH COMMAND EXECUTORS ==========

    /** /发布作品 */
    async execute发布作品(interaction) {
        const authError = await forumPanelHandler.checkEligibility(interaction);
        if (authError) return await forumPanelHandler.sendAuthFailed(interaction, authError);

        // 仅限帖子作者或管理员
        if (interaction.channel?.isThread()) {
            if (
                interaction.user.id !== interaction.channel.ownerId &&
                !interaction.member.permissions.has('Administrator')
            ) {
                return await interaction.reply({ content: '❌ 权限不足：只有本帖的发布者（楼主）才能在此发布作品。', flags: [64] });
            }
        }

        const uploadWizardHandler = require('./upload_wizard_handler');
        await uploadWizardHandler.startWizard(interaction);
    }

    /** /关闭自动提示 */
    async execute关闭自动提示(interaction) {
        await interaction.deferReply({ flags: [64] });
        await this.db.setUserPreference(interaction.user.id, true);
        await interaction.editReply({ content: '✅ 已关闭发帖时的自动提示。您仍可使用 `/发布作品` 手动呼出面板。' });
    }

    /** /启用自动提示 */
    async execute启用自动提示(interaction) {
        await interaction.deferReply({ flags: [64] });
        await this.db.setUserPreference(interaction.user.id, false);
        await interaction.editReply({ content: '✅ 已启用发帖时的自动提示。' });
    }

    /** /获取作品（获取当前帖子最新文件） */
    async execute获取作品(interaction) {
        const authError = await forumPanelHandler.checkEligibility(interaction);
        if (authError) return await forumPanelHandler.sendAuthFailed(interaction, authError);

        const sourceMessageId = interaction.channelId;
        const latestFile = await this.db.getLatestFileBySourceMessage(sourceMessageId);

        if (!latestFile) {
            return await interaction.reply({ content: '❌ 本帖内尚未发布任何作品，或作品已被移除。', flags: [64] });
        }

        const getFileHandler = require('./get_file_handler');
        const originalOptions = interaction.options;
        interaction.options = {
            getString: (name) => name === 'file_id' ? latestFile.id : originalOptions.getString(name)
        };
        await getFileHandler.execute(interaction);
    }

    /** /移除作品 */
    async execute移除作品(interaction) {
        await interaction.deferReply({ flags: [64] });

        const fileId = interaction.options.getString('file_id').trim();
        const isAdmin = interaction.member.permissions.has('Administrator');

        try {
            const success = await this.db.deleteFileRecord(fileId, interaction.user.id, isAdmin);
            if (success) {
                await interaction.editReply({ content: `✅ 文件 \`${fileId}\` 及其所有访问信息已彻底删除。` });
            } else {
                await interaction.editReply({ content: `❌ 未找到编号为 \`${fileId}\` 的文件，或您没有删除权限（仅发布者或管理员可删除）。` });
            }
        } catch (error) {
            console.error('[ForumCommandsHandler] 删除文件失败:', error);
            await interaction.editReply({ content: '❌ 删除过程中发生数据库错误。' });
        }
    }

    // 通用 execute 入口，由 CommandRegistry 调用
    async execute(interaction) {
        const name = interaction.commandName;
        const methodName = `execute${name}`;
        if (typeof this[methodName] === 'function') {
            return await this[methodName](interaction);
        }
        await interaction.reply({ content: '❌ 未找到对应的处理逻辑', flags: [64] });
    }

    // ========== BUTTON HANDLERS ==========

    async handleButton(interaction) {
        const customId = interaction.customId;

        // 【移除消息】
        if (customId.startsWith('fp_remove_panel:')) {
            const uploaderId = customId.split(':')[1];
            if (interaction.user.id !== uploaderId && !interaction.member.permissions.has('Administrator')) {
                return await interaction.reply({ content: '❌ 只有发布者或管理员可以移除此面板。', flags: [64] });
            }
            await interaction.message.delete();
            return;
        }

        // 【不再提示】
        if (customId.startsWith('fp_disable_prompt:')) {
            const uploaderId = customId.split(':')[1];
            if (interaction.user.id !== uploaderId) {
                return await interaction.reply({ content: '❌ 只有发布者可以操作此面板。', flags: [64] });
            }
            await this.db.setUserPreference(interaction.user.id, true);
            await interaction.reply({ content: '✅ 已关闭自动提示。可使用 `/启用自动提示` 重新开启。', flags: [64] });
            await interaction.message.delete();
            return;
        }

        // 【重新发布】
        if (customId.startsWith('fp_republish:')) {
            const uploaderId = customId.split(':')[1];
            if (interaction.user.id !== uploaderId && !interaction.member.permissions.has('Administrator')) {
                return await interaction.reply({ content: '❌ 只有该帖子的作者可以重新发布作品。', flags: [64] });
            }
            await interaction.reply({ content: '💡 **请在聊天框再次输入 `/发布作品` 命令。**\n\n这会弹出配置面板供您上传新文件并覆盖之前的发布处。', flags: [64] });
            return;
        }

        // 【标注/取消标注本消息】
        if (customId.startsWith('fp_pin_panel:')) {
            const uploaderId = customId.split(':')[1];
            if (interaction.user.id !== uploaderId && !interaction.member.permissions.has('Administrator')) {
                return await interaction.reply({ content: '❌ 只有该帖子的作者可以标注或取消标注作品发布处。', flags: [64] });
            }
            try {
                if (interaction.message.pinned) {
                    await interaction.message.unpin();
                    await interaction.reply({ content: '✅ 已取消标注本条发布处。', flags: [64] });
                } else {
                    await interaction.message.pin();
                    await interaction.reply({ content: '✅ 已将本条发布处标注（Pin），用户可在频道顶端的图钉处快速找到它。', flags: [64] });
                }
            } catch (err) {
                console.error('Pin/Unpin error:', err);
                await interaction.reply({ content: '❌ 无法标注或取消标注消息。可能是缺少权限（管理消息）。', flags: [64] });
            }
            return;
        }

        // 【获取作品】
        if (customId.startsWith('fp_get_work:')) {
            const fileId = customId.split(':')[1];
            const getFileHandler = require('./get_file_handler');

            const pseudoInteraction = new Proxy(interaction, {
                get(target, prop, receiver) {
                    if (prop === 'options') {
                        return {
                            getString: (name) => name === 'file_id' ? fileId : null
                        };
                    }
                    const value = Reflect.get(target, prop, receiver);
                    return typeof value === 'function' ? value.bind(target) : value;
                }
            });

            try {
                await getFileHandler.execute(pseudoInteraction);
            } catch (err) {
                console.error('[ForumCommandsHandler] 获取作品按钮出错:', err);
                const reply = { content: '❌ 获取作品时发生系统错误。', flags: [64] };
                if (interaction.replied || interaction.deferred) await interaction.editReply(reply);
                else await interaction.reply(reply);
            }
            return;
        }
    }

    /** /查询作品 */
    async execute查询作品(interaction) {
        await interaction.deferReply({ flags: [64] }); // 只有自己可见
        
        try {
            const fileId = interaction.options.getString('file_id').trim();
            const userId = interaction.user.id;
            
            // 1. 获取文件基础信息
            const fileRecord = await this.db.getFileRecord(fileId);
            if (!fileRecord) {
                return await interaction.editReply({ content: '❌ 找不到指定的作品ID，可能有误或已被删除。' });
            }

            // 2. 权限校验
            const guild = interaction.guild;
            const member = await guild.members.fetch(userId).catch(() => null);
            const isOwner = guild.ownerId === userId;
            const isAdmin = member?.permissions?.has('Administrator');
            const hasFullAccess = isOwner || isAdmin;
            
            const isUploader = fileRecord.uploader_id === userId;

            // 如果既不是发布者也不是管理员/服主，拒绝访问
            if (!hasFullAccess && !isUploader) {
                return await interaction.editReply({ content: '❌ 权限不足：只有该作品的发布者、服务器管理员或服主可以查询下载统计信息。' });
            }

            // 3. 获取统计数据
            const stats = await this.db.getFileStats(fileId);
            
            // 4. 构建 Embed
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('📊 作品数据统计查询')
                .setColor(0x3498db)
                .addFields(
                    { name: '作品 ID', value: `\`${fileId}\``, inline: true },
                    { name: '发布者', value: `<@${fileRecord.uploader_id}>`, inline: true },
                    { name: '发布时间', value: `<t:${Math.floor(new Date(fileRecord.upload_time).getTime() / 1000)}:F>`, inline: false },
                    { name: '总下载/获取次数', value: `**${stats.totalDownloads}** 次`, inline: false }
                );
                
            // 只有管理员/服主可以看到具体的下载人ID列表
            if (hasFullAccess) {
                let downloadLogsText = '';
                if (stats.recentLogs.length > 0) {
                    const logs = stats.recentLogs.slice(0, 15); // 只显示最近15条防止字数超限
                    downloadLogsText = logs.map((log, index) => `${index + 1}. <@${log.user_id}> - <t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`).join('\n');
                    if (stats.recentLogs.length > 15) {
                        downloadLogsText += `\n*...等共 ${stats.totalDownloads} 条记录*`;
                    }
                } else {
                    downloadLogsText = '暂无下载记录。';
                }
                
                embed.addFields({ name: '🔐 详细下载记录 (仅管理层可见)', value: downloadLogsText, inline: false });
            } else if (isUploader) {
                // 原作者只能看时间点，不知道具体是谁
                let downloadLogsText = '';
                if (stats.recentLogs.length > 0) {
                    const logs = stats.recentLogs.slice(0, 5); // 随机展示最近5条的时间点
                    downloadLogsText = logs.map((log, index) => `${index + 1}. 匿名用户 - <t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`).join('\n');
                    if (stats.recentLogs.length > 5) {
                        downloadLogsText += `\n*...等共 ${stats.totalDownloads} 条记录*`;
                    }
                } else {
                    downloadLogsText = '暂无下载记录。';
                }
                embed.addFields({ name: '最近下载动态', value: downloadLogsText, inline: false });
                embed.setFooter({ text: '具体的用户ID记录仅服务器管理员及服主可见' });
            }

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('[ForumCommandsHandler] 查询作品出错:', error);
            await interaction.editReply({ content: '❌ 查询时发生内部错误。' });
        }
    }

    /** /查询用户 */
    async execute查询用户(interaction) {
        await interaction.deferReply({ flags: [64] }); // 只有自己可见
        
        try {
            const targetUser = interaction.options.getUser('user');
            const executorId = interaction.user.id;
            
            // 1. 权限校验
            const guild = interaction.guild;
            const member = await guild.members.fetch(executorId).catch(() => null);
            const isOwner = guild.ownerId === executorId;
            const isAdmin = member?.permissions?.has('Administrator');
            const hasFullAccess = isOwner || isAdmin;

            // 如果不是管理员/服主，拒绝访问
            if (!hasFullAccess) {
                return await interaction.editReply({ content: '❌ 权限不足：只有服务器管理员或服主可以查询用户的下载统计信息。' });
            }

            // 2. 获取统计数据
            const stats = await this.db.getUserDownloadStats(targetUser.id);
            
            // 3. 构建 Embed
            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('👤 用户下载记录查询')
                .setColor(0x9b59b6)
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '查询用户', value: `<@${targetUser.id}>`, inline: true },
                    { name: '用户 ID', value: `\`${targetUser.id}\``, inline: true },
                    { name: '历史总下载量', value: `**${stats.totalDownloads}** 次`, inline: false }
                );
                
            let downloadLogsText = '';
            if (stats.recentLogs.length > 0) {
                const logs = stats.recentLogs.slice(0, 15); // 只显示最近15条防止字数超限
                downloadLogsText = logs.map((log, index) => `${index + 1}. 文件ID \`${log.file_id}\` - <t:${Math.floor(new Date(log.timestamp).getTime() / 1000)}:R>`).join('\n');
                if (stats.recentLogs.length > 15) {
                    downloadLogsText += `\n*...等共 ${stats.totalDownloads} 条记录*`;
                }
            } else {
                downloadLogsText = '暂无下载记录。';
            }
            
            embed.addFields({ name: '🔐 最近获取明细 (仅管理层可见)', value: downloadLogsText, inline: false });

            await interaction.editReply({ embeds: [embed] });
            
        } catch (error) {
            console.error('[ForumCommandsHandler] 查询用户出错:', error);
            await interaction.editReply({ content: '❌ 查询时发生内部错误。' });
        }
    }

    // ========== MODAL HANDLERS ==========

    async handleModalSubmit(interaction) {
        if (!interaction.customId.startsWith('modal_publish_work:')) return false;

        const messageId = interaction.customId.split(':')[1];
        await interaction.deferUpdate();

        try {
            const fileUrl = interaction.fields.getTextInputValue('file_url').trim();
            const conditionsStr = interaction.fields.getTextInputValue('conditions').trim();

            const reqReaction = conditionsStr.includes('1');
            const reqCaptcha = conditionsStr.includes('2');
            const reqTerms = conditionsStr.includes('3');
            const sourceMessageId = interaction.channelId;

            let fileName = fileUrl.split('/').pop().split('?')[0];
            if (!fileName || fileName.length < 3) fileName = `file_${Date.now()}`;

            const fileId = await this.db.getNextFileId();
            const fileData = {
                id: fileId,
                uploader_id: interaction.user.id,
                file_name: fileName,
                file_url: fileUrl,
                upload_time: new Date().toISOString(),
                source_message_id: sourceMessageId,
                req_reaction: reqReaction,
                req_captcha: reqCaptcha,
                req_terms: reqTerms
            };

            await this.db.saveFileRecord(fileData);

            let originalMessage = null;
            try { originalMessage = await interaction.channel.messages.fetch(messageId); } catch (e) { }

            const payload = await forumPanelHandler.convertToPublicPanel(fileData);
            if (originalMessage) {
                await originalMessage.delete().catch(() => {});
            }
            await interaction.channel.send(payload);

            await interaction.followUp({ content: `✅ 作品已成功发布！文件ID: \`${fileId}\``, flags: [64] });

        } catch (error) {
            console.error('[ForumCommandsHandler] 发布模态框处理错误:', error);
            await interaction.followUp({ content: '❌ 保存文件信息失败。', flags: [64] });
        }

        return true;
    }
}

const instance = new ForumCommandsHandler();

// 为 CommandRegistry 注册多个命令名 → 同一个 handler
const commandNames = ['发布作品', '关闭自动提示', '启用自动提示', '获取作品', '查询作品', '查询用户', '移除作品'];
module.exports = instance;

// 导出各命令的独立 handler 对象供 command_registry 使用
for (const name of commandNames) {
    const handlerObj = {
        commandName: name,
        requiredPermission: 0,
        execute: (interaction) => instance.execute(interaction)
    };
    // 挂载到 module.exports 便于外部直接引用
    module.exports[name] = handlerObj;
}
