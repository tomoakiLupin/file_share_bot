const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: 'aaa发布作品',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.executeaaa发布作品(interaction)
};
