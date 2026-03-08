const path = require('path');
const { config } = require('../config/config');
const BotClient = require('./client');
const CommandRegistry = require('../utils/command_registry');
const CommandService = require('./services/command_service');
const CommandHandler = require('./interactions/command_handler');
const ButtonHandler = require('./interactions/button_handler');
const ModalSubmitHandler = require('./interactions/modal_submit_handler');

class Bot {
    constructor() {
        this.botClient = new BotClient();
        this.client = this.botClient.getClient();
        this.commandRegistry = new CommandRegistry();
        this.commandService = new CommandService();
        this.commandHandler = new CommandHandler(this.commandRegistry);
        this.buttonHandler = new ButtonHandler();
        this.modalSubmitHandler = new ModalSubmitHandler();

        this.setupInteractionHandlers();
    }

    setupInteractionHandlers() {
        this.client.on('interactionCreate', async (interaction) => {
            // [测试开关] 记录所有的动作日志到本地文件
            try {
                require('../utils/test_activity_logger').logInteraction(interaction);
            } catch (err) {
                console.error('[Top-Level Event Router Logger Error]', err);
            }

            if (await this.commandHandler.handleInteraction(interaction)) return;
            if (await this.buttonHandler.handleInteraction(interaction)) return;
            if (await this.modalSubmitHandler.handleInteraction(interaction)) return;
        });
    }

    setupThreadCreateHandler() {
        const forumPanelHandler = require('../handler/file_share/forum_panel_handler');
        this.client.on('threadCreate', async (thread) => {
            await forumPanelHandler.handleThreadCreate(thread);
        });
    }

    async setupCommands() {
        const guildIds = config.get('bot_config.main_config.safety_setting.command_push_guildids', []);

        this.commandRegistry.loadCommands(path.join(__dirname, '../command'));
        this.commandRegistry.loadHandlers(path.join(__dirname, '../handler'));

        const commands = this.commandRegistry.getAllCommands();
        if (commands.length > 0) {
            this.commandService.initialize(process.env.DISCORD_TOKEN);
            await this.commandService.registerCommands(this.client.user.id, commands, guildIds);
        }
    }

    async start() {
        this.client.once('ready', async () => {
            await this.setupCommands();
            this.setupThreadCreateHandler();
            console.log('[bot] 所有模块初始化完成，机器人就绪！');
            // Signal PM2 that we are ready
            if (process.send) process.send('ready');
        });

        await this.botClient.login();
    }
}

module.exports = Bot;
