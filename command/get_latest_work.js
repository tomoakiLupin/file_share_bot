const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aaa获取作品')
        .setDescription('获取当前论坛帖子内最新发布的作品')
        ,
    commandName: 'aaa获取作品',
};
