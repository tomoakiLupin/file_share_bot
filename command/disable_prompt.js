const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aaa关闭自动提示')
        .setDescription('关闭在论坛发帖时自动弹出的作品发布提示')
        ,
    commandName: 'aaa关闭自动提示',
};
