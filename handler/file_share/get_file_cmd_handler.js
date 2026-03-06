const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: '获取文件',
    requiredPermission: 0,
    execute: (interaction) => {
        const getFileHandler = require('./get_file_handler');
        return getFileHandler.execute(interaction);
    }
};
