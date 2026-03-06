class ModalSubmitHandler {
    constructor() {
        this.forumCommandsHandler = require('../../handler/file_share/forum_commands_handler');
        this.uploadWizardHandler = require('../../handler/file_share/upload_wizard_handler');
    }

    async handleInteraction(interaction) {
        if (!interaction.isModalSubmit()) {
            return false;
        }

        try {
            const customId = interaction.customId;

            // 旧版发布作品模态框
            if (customId.startsWith('modal_publish_work:')) {
                await this.forumCommandsHandler.handleModalSubmit(interaction);
                return true;
            }

            // 上传向导的模态框 (wiz_modal_*)
            if (customId.startsWith('wiz_modal_')) {
                await this.uploadWizardHandler.handleModalSubmit(interaction);
                return true;
            }

            // 由本地 awaitModalSubmit collector 处理的模态框
            if (customId === 'captcha_modal') {
                return true;
            }

            await interaction.reply({ content: '❌ 未知的模态框提交', ephemeral: true });

        } catch (error) {
            console.error('[modal_handler] 处理模态框提交时出错:', error);
            const reply = { content: '❌ 处理提交时发生错误，请稍后重试', ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }

        return true;
    }
}

module.exports = ModalSubmitHandler;
