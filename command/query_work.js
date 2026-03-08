const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('查询作品')
        .setDescription('查询某个获取作品的代码的具体下载统计信息')
        .addStringOption(option => 
            option.setName('file_id')
                .setDescription('要查询的作品 ID')
                .setRequired(true)
        ),
    commandName: '查询作品',
};
