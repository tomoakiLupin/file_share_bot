const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: 'aaa获取作品',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.executeaaa获取作品(interaction)
};
