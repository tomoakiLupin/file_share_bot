const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: '发布作品',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.execute发布作品(interaction)
};
