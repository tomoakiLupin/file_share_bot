const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: '移除作品',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.execute移除作品(interaction)
};
