const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: '获取作品',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.execute获取作品(interaction)
};
