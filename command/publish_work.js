const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('发布作品')
        .setDescription('打开作品发布面板，配置文件上传条件后发布')
        .setNameLocalizations({ 'en-US': 'publish_work', 'zh-TW': '發布作品' }),
    commandName: '发布作品',
};
