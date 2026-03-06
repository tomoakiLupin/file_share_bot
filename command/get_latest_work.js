const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('获取作品')
        .setDescription('获取当前论坛帖子内最新发布的作品')
        .setNameLocalizations({ 'en-US': 'get_latest_work', 'zh-TW': '獲取作品' }),
    commandName: '获取作品',
};
