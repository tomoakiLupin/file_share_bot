const fs = require('fs');
const path = require('path');

class TestActivityLogger {
    constructor() {
        // Ensure the logs directory exists
        this.logDir = path.join(__dirname, '../logs');
        if (!fs.existsSync(this.logDir)) {
            fs.mkdirSync(this.logDir, { recursive: true });
        }
    }

    /**
     * Get the current date in YYYY-MM-DD format for log rotation
     */
    getCurrentDateStr() {
        const d = new Date();
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Get detailed formatted timestamp
     */
    getTimestamp() {
        return new Date().toISOString().replace('T', ' ').substring(0, 19);
    }

    /**
     * Write log entry to today's log file
     */
    writeToFile(logEntry) {
        const dateStr = this.getCurrentDateStr();
        const logFile = path.join(this.logDir, `activity_${dateStr}.log`);
        
        try {
            fs.appendFileSync(logFile, logEntry + '\n', 'utf8');
        } catch (error) {
            console.error('[TestActivityLogger] 写入日志文件失败:', error);
        }
    }

    /**
     * Analyze and log the Discord interaction
     * @param {import('discord.js').Interaction} interaction 
     */
    logInteraction(interaction) {
        if (!interaction) return;

        const time = this.getTimestamp();
        const user = `[User: ${interaction.user.username} | ID: ${interaction.user.id}]`;
        const channel = interaction.channelId ? `[Channel: ${interaction.channelId}]` : '[DM]';
        
        let actionStr = '';

        if (interaction.isChatInputCommand()) {
            actionStr = `🛑 执行了斜杠命令: /${interaction.commandName}`;
            
            // Log arguments if any exist
            const args = interaction.options.data.map(opt => `${opt.name}=${opt.value}`).join(', ');
            if (args) actionStr += ` (参数: ${args})`;

        } else if (interaction.isButton()) {
            actionStr = `🖱️ 点击了按钮 (CustomID: ${interaction.customId})`;

        } else if (interaction.isModalSubmit()) {
            actionStr = `📝 提交了表单/模态框 (CustomID: ${interaction.customId})`;
            
        } else if (interaction.isStringSelectMenu() || interaction.isUserSelectMenu()) {
            actionStr = `🔽 使用了下拉菜单 (CustomID: ${interaction.customId})`;
        } else {
            actionStr = `❓ 触发了其他交互类型: ${interaction.type}`;
        }

        const logMessage = `[${time}] ${user} ${channel} => ${actionStr}`;
        
        // Print to console for real-time monitoring and write to file
        console.log(logMessage);
        this.writeToFile(logMessage);
    }
}

module.exports = new TestActivityLogger();
