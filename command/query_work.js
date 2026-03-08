const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aaa查询作品')
        .setDescription('查询作品统计信息。若在帖子内不填ID，则查询该帖所有作品。')
        .addStringOption(option => 
            option.setName('file_id')
                .setDescription('要查询的作品 ID (帖子内可不填)')
                .setRequired(false)
        ),
    commandName: 'aaa查询作品',
};
