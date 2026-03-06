const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('获取文件')
        .setDescription('通过文件ID获取/下载共享文件')
        .setNameLocalizations({ 'en-US': 'get_file', 'zh-TW': '獲取文件' })
        .addStringOption(option =>
            option.setName('file_id')
                .setDescription('文件的唯一提取码 (ID)')
                .setRequired(true)
        ),
    commandName: '获取文件',
};
