const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: 'aaa查询用户',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.executeaaa查询用户(interaction)
};
