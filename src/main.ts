import AIBackend from "./backends/ai/common.ts";
import GoogleAIBackend from "./backends/ai/google.ts";

import ChatBackend from "./backends/chat/common.ts";
import DiscordBotChatBackend from "./backends/chat/discord-bot.ts";
import DiscordSelfbotChatBackend from "./backends/chat/discord-selfbot.ts";

import BottedMember from "./bot.ts";

import process from 'node:process';

process.on('uncaughtException', (e) => {
    console.error(e.stack ?? e.message);
})

interface BottedMemberConfig {
    authentication: {
        ai: string,
        chat: string
    },
    chat: {
        selectedBackend: 'discord/bot' | 'discord/selfbot',
        filters: {
            allowedChannels: string[] | '*',
            mustStartWith?: string
        }
    },
    ai: {
        selectedBackend: 'google',
        submodel: string,
        systemPromptFile: string
    }
}

class BottedCommunityDriver {
    getChatBackend(id: BottedMemberConfig['chat']['selectedBackend']): ChatBackend {
        switch (id) {
        case "discord/bot":
            return new DiscordBotChatBackend();
        case "discord/selfbot":
            return new DiscordSelfbotChatBackend();
        }
    }

    getAIBackend(id: BottedMemberConfig['ai']['selectedBackend']): AIBackend {
        switch (id) {
        case "google":
            return new GoogleAIBackend();
        }
    }

    async main() {
        for (const file of Deno.readDirSync('./models/')) {
            if (!file.isFile || !file.name.endsWith('.json'))
                continue;
    
            const config: BottedMemberConfig = 
                JSON.parse(Deno.readTextFileSync(`./models/${file.name}`));

            const chatBackend = this.getChatBackend(config.chat.selectedBackend);
            await chatBackend.init(config.authentication.chat);
    
            const aiBackend = this.getAIBackend(config.ai.selectedBackend);
            aiBackend.init(config.authentication.ai);
    
            const bot = new BottedMember({
                ai: {
                    systemPrompt: Deno.readTextFileSync('models/' + config.ai.systemPromptFile).split('\n'),
                    submodel: config.ai.submodel
                },
                backends: {
                    chat: chatBackend,
                    ai: aiBackend
                },
                chat: {
                    allowedChannels: config.chat.filters.allowedChannels,
                    mustStartWith: config.chat.filters.mustStartWith 
                }
            });
            await bot.init();
        }
    }
}

const driver = new BottedCommunityDriver();
await driver.main();
