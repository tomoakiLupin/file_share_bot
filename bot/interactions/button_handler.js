class ButtonHandler {
    constructor() {
        this.forumCommandsHandler = require('../../handler/file_share/forum_commands_handler');
        this.uploadWizardHandler = require('../../handler/file_share/upload_wizard_handler');
    }

    async handleInteraction(interaction) {
        if (!interaction.isButton() && !interaction.isStringSelectMenu()) {
            return false;
        }

        try {
            const customId = interaction.customId;

            // 论坛面板按钮 (fp_*)
            if (customId.startsWith('fp_')) {
                await this.forumCommandsHandler.handleButton(interaction);
                return true;
            }

            // 上传向导按钮 (wiz_*)
            if (customId.startsWith('wiz_')) {
                await this.uploadWizardHandler.handleButton(interaction);
                return true;
            }

            // 由本地 collector 处理的按钮，此处忽略
            if (
                customId === 'btn_captcha' ||
                customId === 'btn_confirm_terms'
            ) {
                return true;
            }

            // 未知按钮
            if (interaction.isButton()) {
                await interaction.reply({ content: '❌ 未知的按钮操作', flags: [64] });
            }

        } catch (error) {
            console.error('[button_handler] 处理按钮交互时出错:', error);
            const reply = { content: '❌ 处理交互时发生错误，请稍后重试', flags: [64] };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }

        return true;
    }
}

module.exports = ButtonHandler;
