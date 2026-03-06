const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('启用自动提示')
        .setDescription('重新开启在论坛发帖时自动弹出的作品发布提示')
        .setNameLocalizations({ 'en-US': 'enable_prompt', 'zh-TW': '啟用自動提示' }),
    commandName: '启用自动提示',
};
