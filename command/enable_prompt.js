const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aaa启用自动提示')
        .setDescription('重新开启在论坛发帖时自动弹出的作品发布提示')
        ,
    commandName: 'aaa启用自动提示',
};
