const forumCommandsHandler = require('./forum_commands_handler');

module.exports = {
    commandName: '查询作品',
    requiredPermission: 0,
    execute: (interaction) => forumCommandsHandler.execute查询作品(interaction)
};
