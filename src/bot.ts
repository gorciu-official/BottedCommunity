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

    private typingState = new Map<string, {
        newerMessageSent: boolean;
    }>();

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

    private isChannelAllowed(channelId: string): boolean {
        if (this.chatSettings.allowedChannels == '*')
            return true;

        if (!this.chatSettings.allowedChannels.includes(channelId))
            return false;

        return true;
    }

    // TODO: move message handler from init to a separate function
    public async init() {

        await Promise.resolve();

        console.log(`Bot attached to account @${await this.chatBackend.getUsername()}`);

        this.chatBackend.setMessageHandler(async (msg) => {
            if (msg.author.id !== msg.externalInformation.selfUserId) {
                for (const state of this.typingState.values()) 
                    state.newerMessageSent = true;
            }

            if (
                // if this is the user itself, we should not reply to ourselves
                // for I think obvious reasons
                msg.author.id === msg.externalInformation.selfUserId ||
                // check if channel is allowed
                !this.isChannelAllowed(msg.channel.id) ||
                // if there is no text, there is nothing to reply to 
                !msg.text ||
                // if this is a clear bot that requires the message to start with a specific
                // identifier, require it  
                (this.chatSettings.mustStartWith && !msg.text.startsWith(this.chatSettings.mustStartWith)) ||
                // global ai killswitch for this project (kinda)
                msg.text.startsWith('\\no-ai-reply ')
            ) return;

            this.typingState.set(msg.id, { newerMessageSent: false });

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
                    } else if (this.typingState.get(msg.id)?.newerMessageSent) {
                        lastSentMessage = await lastSentMessage!.reply(singularText);

                        this.typingState.set(msg.id, { newerMessageSent: false });
                    } else lastSentMessage = await msg.channel.send(singularText);
                }
            } finally {
                this.typingState.delete(msg.id);
            }
        });
    }
};
