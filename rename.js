const fs = require('fs');
const path = require('path');

const targets = ['发布作品', '关闭自动提示', '启用自动提示', '获取作品', '查询作品', '查询用户', '移除作品'];
const targetRegex = new RegExp('\(' + targets.join('|') + '\)', 'g');

function replaceInFile(fullPath) {
    let content = fs.readFileSync(fullPath, 'utf8');
    let originalContent = content;

    // .setName('名称')
    content = content.replace(/\.setName\(['"]([^'"]+)['"]\)/g, (match, p1) => {
        if (targets.includes(p1)) return `.setName('aaa${p1}')`;
        return match;
    });

    // commandName: '名称'
    content = content.replace(/commandName:\s*['"]([^'"]+)['"]/g, (match, p1) => {
        if (targets.includes(p1)) return `commandName: 'aaa${p1}'`;
        return match;
    });

    // const commandNames = ['名称'...
    content = content.replace(/['"]([^'"]+)['"]/g, (match, p1) => {
        if (targets.includes(p1) && content.includes('const commandNames =')) {
            return `'aaa${p1}'`;
        }
        return match;
    });

    // forum_commands_handler.js special: 
    // execute aaa名称
    content = content.replace(/execute([a-zA-Z\u4e00-\u9fa5]+)\(/g, (match, p1) => {
        if (targets.includes(p1)) return `executeaaa${p1}(`;
        return match;
    });
    content = content.replace(/forumCommandsHandler\.execute([a-zA-Z\u4e00-\u9fa5]+)\(/g, (match, p1) => {
        if (targets.includes(p1)) return `forumCommandsHandler.executeaaa${p1}(`;
        return match;
    });

    if (content !== originalContent) {
        fs.writeFileSync(fullPath, content);
        console.log('Modified:', fullPath);
    }
}

function scanDir(dir) {
    fs.readdirSync(dir).forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            scanDir(fullPath);
        } else if (fullPath.endsWith('.js')) {
            replaceInFile(fullPath);
        }
    });
}

scanDir('./command');
scanDir('./handler');
console.log('Update finished.');
