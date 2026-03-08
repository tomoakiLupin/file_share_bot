const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: 'aaa关闭自动提示',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.executeaaa关闭自动提示(interaction)
};
