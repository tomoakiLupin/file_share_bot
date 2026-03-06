const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: '关闭自动提示',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.execute关闭自动提示(interaction)
};
