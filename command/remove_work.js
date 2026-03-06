const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('移除作品')
        .setDescription('根据文件ID彻底删除自己上传的文件及其分享记录')
        .setNameLocalizations({ 'en-US': 'remove_work', 'zh-TW': '移除作品' })
        .addStringOption(option =>
            option.setName('file_id')
                .setDescription('要删除的文件提取码 (ID)')
                .setRequired(true)
        ),
    commandName: '移除作品',
};
