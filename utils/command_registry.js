const fs = require('fs');
const path = require('path');
const { Collection } = require('discord.js');

/**
 * 管理斜杠命令定义及处理器的加载、注册和检索
 */
class CommandRegistry {
    constructor() {
        /** @type {Collection<string, object>} */
        this.commands = new Collection();
        /** @type {Collection<string, object>} */
        this.handlers = new Collection();
    }

    /**
     * 递归扫描目录，加载所有命令定义文件（需导出 data.name）
     * @param {string} commandsPath
     */
    loadCommands(commandsPath) {
        if (!fs.existsSync(commandsPath)) {
            console.warn(`[command_registry] 命令目录未找到: ${commandsPath}`);
            return;
        }

        const entries = fs.readdirSync(commandsPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(commandsPath, entry.name);
            if (entry.isDirectory()) {
                this.loadCommands(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                try {
                    const command = require(fullPath);
                    if (command.data && command.data.name) {
                        this.commands.set(command.data.name, command);
                        console.log(`[command_registry] ✓ 已加载命令: ${command.data.name}`);
                    } else {
                        console.warn(`[command_registry] ✗ ${entry.name} 未导出 data.name`);
                    }
                } catch (error) {
                    console.error(`[command_registry] ✗ 加载命令失败 ${entry.name}:`, error);
                }
            }
        }
    }

    /**
     * 递归扫描目录，加载所有处理器文件（需导出 commandName）
     * @param {string} handlersPath
     */
    loadHandlers(handlersPath) {
        if (!fs.existsSync(handlersPath)) {
            console.warn(`[command_registry] 处理器目录未找到: ${handlersPath}`);
            return;
        }

        const entries = fs.readdirSync(handlersPath, { withFileTypes: true });

        for (const entry of entries) {
            const fullPath = path.join(handlersPath, entry.name);
            if (entry.isDirectory()) {
                this.loadHandlers(fullPath);
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                try {
                    const handler = require(fullPath);
                    if (handler.commandName) {
                        this.handlers.set(handler.commandName, handler);
                        console.log(`[command_registry] ✓ 已注册处理器: ${handler.commandName}`);
                    }
                } catch (error) {
                    console.error(`[command_registry] ✗ 加载处理器失败 ${entry.name}:`, error);
                }
            }
        }
    }

    getHandler(commandName) {
        return this.handlers.get(commandName);
    }

    getCommand(commandName) {
        return this.commands.get(commandName);
    }

    getAllCommands() {
        return Array.from(this.commands.values()).map(cmd => cmd.data);
    }
}

module.exports = CommandRegistry;
