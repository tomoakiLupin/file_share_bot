const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: 'aaa启用自动提示',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.executeaaa启用自动提示(interaction)
};
