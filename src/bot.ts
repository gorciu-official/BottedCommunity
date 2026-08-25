import AIBackend from "./backends/ai/common.ts";
import ChatBackend, { ChatMessage } from "./backends/chat/common.ts";

interface AISettings {
    systemPrompt: string[],
    submodel: string
}

interface ChatSettings {
    allowedChannels: string[] | '*',
    sendTypingInterval?: number,
    mustStartWith?: string
}

export interface BottedMemberOptions {
    ai: AISettings,
    chat: ChatSettings
    backends: {
        chat: ChatBackend,
        ai: AIBackend
    }
}

export default class BottedMember {
    private chatBackend: ChatBackend;
    private aiBackend: AIBackend;

    private aiSettings: AISettings;
    private chatSettings: ChatSettings;

    public constructor(options: BottedMemberOptions) {
        this.aiBackend = options.backends.ai;
        this.chatBackend = options.backends.chat;

        this.aiSettings = options.ai;
        this.chatSettings = options.chat;
    }
    
    // this function was vibecoded
    private async waitNeededTime(
        ms: number,
        sendTyping: () => void,
        sendTypingInterval: number = 8000,
    ): Promise<void> {
        const startTime = Date.now();
    
        sendTyping();
    
        while (Date.now() - startTime < ms) {
            const remainingTime = ms - (Date.now() - startTime);
            const waitTime = Math.min(sendTypingInterval, remainingTime);
    
            await new Promise<void>((resolve) => setTimeout(resolve, waitTime));
    
            if (Date.now() - startTime < ms) {
                sendTyping();
            }
        }
    }

    private isAllowed(msg: ChatMessage): boolean {
        if (this.chatSettings.allowedChannels == '*')
            return true;

        if (!this.chatSettings.allowedChannels.includes(msg.channel.id))
            return false;

        return true;
    }

    public async init() {
        const generating = new Map<string, {
            newerMessage: ChatMessage | null;
        }>();

        await new Promise<void>((r) => r());

        this.chatBackend.setMessageHandler(async (msg) => {
            if (msg.author.id !== msg.externalInformation.selfUserId)
                for (const state of generating.values()) {
                    state.newerMessage = msg;
                }

            if (
                msg.author.id === msg.externalInformation.selfUserId ||
                !this.isAllowed(msg) ||
                !msg.text ||
                (this.chatSettings.mustStartWith && !msg.text.startsWith(this.chatSettings.mustStartWith)) ||
                msg.text.startsWith('\\no-ai-reply ')
            ) return;

            const state = {
                newerMessage: null 
            };

            generating.set(msg.id, state);

            try {
                const response = await this.aiBackend.generateResponse({
                    prompt: msg.text,
                    systemPrompt: this.aiSettings.systemPrompt.join('\n'),
                    context: await msg.channel.fetchContext(20),
                    submodel: this.aiSettings.submodel
                });

                if (!response) {
                    console.log(
                        `AI failed to reply to message "${msg.text}", responseText is false-ish`
                    );
                    return;
                }

                let first = true;
                let lastSentMessage: ChatMessage | null = null;

                for (const singularText of response.split('\n')) {
                    if (!singularText.trim())
                        continue;

                    const neededTime =
                        singularText.split(' ').length * 0.5 * 1000;

                    await this.waitNeededTime(
                        neededTime, () => msg.channel.sendTyping(),
                        this.chatSettings.sendTypingInterval
                    );

                    if (first) {
                        lastSentMessage = await msg.reply(singularText);
                        first = false;
                        continue;
                    } else if (state.newerMessage) {
                        lastSentMessage = await lastSentMessage!.reply(singularText);

                        state.newerMessage = null;
                    } else lastSentMessage = await msg.channel.send(singularText);
                }
            } finally {
                generating.delete(msg.id);
            }
        });
    }
};
