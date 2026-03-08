const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aaa发布作品')
        .setDescription('打开作品发布面板，配置文件上传条件后发布')
        .addAttachmentOption(option => 
            option.setName('file')
                .setDescription('【手机用户推荐直接在此传文件】要发布的作品附件')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('req_reaction')
                .setDescription('是否需要点赞才能获取 (true/false)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('captcha_text')
                .setDescription('直接设置提取码口令 (留空则无)')
                .setRequired(false)
        ),
    commandName: 'aaa发布作品',
};
