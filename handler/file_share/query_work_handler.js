const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: 'aaa查询作品',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.executeaaa查询作品(interaction)
};
