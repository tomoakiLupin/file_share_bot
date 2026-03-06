require('dotenv').config();
const Bot = require('./bot');

// 重启配置
const MAX_RESTART_ATTEMPTS = 10; // 最大重启次数
const RESTART_DELAY = 5000;      // 重启延迟（毫秒）
const RESET_INTERVAL = 600000;   // 10分钟后重置重启计数

let restartCount = 0;
let lastRestartTime = Date.now();

async function main() {
    try {
        console.log('[main] 正在启动机器人...');
        const bot = new Bot();
        await bot.start();
        console.log('[main] 机器人启动成功');

        // 启动成功后重置重启计数
        restartCount = 0;
    } catch (error) {
        console.error('[main] 启动机器人时出错:', error);

        // 检查是否需要重置重启计数
        const now = Date.now();
        if (now - lastRestartTime > RESET_INTERVAL) {
            console.log('[main] 重置重启计数器');
            restartCount = 0;
        }
        lastRestartTime = now;

        // 检查是否超过最大重启次数
        if (restartCount >= MAX_RESTART_ATTEMPTS) {
            console.error(`[main] 已达到最大重启次数 (${MAX_RESTART_ATTEMPTS})，程序退出`);
            process.exit(1);
        }

        restartCount++;
        console.log(`[main] 将在 ${RESTART_DELAY / 1000} 秒后重启... (第 ${restartCount}/${MAX_RESTART_ATTEMPTS} 次尝试)`);

        setTimeout(() => {
            main();
        }, RESTART_DELAY);
    }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
    console.error('[main] 未捕获的异常:', error);
    console.log(`[main] 将在 ${RESTART_DELAY / 1000} 秒后重启...`);
    setTimeout(() => {
        process.exit(1);
    }, RESTART_DELAY);
});

// 处理未处理的 Promise 拒绝
process.on('unhandledRejection', (reason, promise) => {
    console.error('[main] 未处理的 Promise 拒绝:', reason);
    console.log(`[main] 将在 ${RESTART_DELAY / 1000} 秒后重启...`);
    setTimeout(() => {
        process.exit(1);
    }, RESTART_DELAY);
});

main();
