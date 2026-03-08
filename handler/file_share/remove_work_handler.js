const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: 'aaa移除作品',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.executeaaa移除作品(interaction)
};
