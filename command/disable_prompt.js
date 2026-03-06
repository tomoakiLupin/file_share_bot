const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('关闭自动提示')
        .setDescription('关闭在论坛发帖时自动弹出的作品发布提示')
        .setNameLocalizations({ 'en-US': 'disable_prompt', 'zh-TW': '關閉自動提示' }),
    commandName: '关闭自动提示',
};
