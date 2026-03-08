const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aaa发布作品')
        .setDescription('打开作品发布面板，配置文件上传条件后发布')
        ,
    commandName: 'aaa发布作品',
};
