const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('查询用户')
        .setDescription('查询某个特定用户的所有作品下载次数及最近下载记录（仅管理层可用）')
        .addUserOption(option => 
            option.setName('user')
                .setDescription('要查询的用户')
                .setRequired(true)
        ),
    commandName: '查询用户',
};
