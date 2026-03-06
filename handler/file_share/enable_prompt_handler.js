const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: '启用自动提示',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.execute启用自动提示(interaction)
};
