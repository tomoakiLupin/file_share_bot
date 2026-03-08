const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: '查询用户',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.execute查询用户(interaction)
};
