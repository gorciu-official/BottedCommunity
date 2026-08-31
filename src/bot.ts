import AIBackend from "./backends/ai/common.ts";
import ChatBackend, { ChatMessage } from "./backends/chat/common.ts";
import { BottedMemberConfig } from "./config.ts";

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
    chat: ChatSettings,
    general: BottedMemberConfig['general'],
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

    private generalSettings: BottedMemberConfig['general'];
    private lastActiveChannel: ChatMessage['channel'] | null = null;

    private loggedIn = false;
    private updatingLoginState = false;
    private lastBotMessageAt = 0;
    private lastLogoutAt = 0;

    private chattingWith: string[] = [];
    private typingState = new Map<string, {
        newerMessageSent: boolean;
    }>();

    public constructor(options: BottedMemberOptions) {
        this.aiBackend = options.backends.ai;
        this.chatBackend = options.backends.chat;

        this.aiSettings = options.ai;
        this.chatSettings = options.chat;

        this.generalSettings = options.general;
    }

    private parseTime(time: string): number {
        const [hours, minutes, seconds] = time.split(':').map(Number);
    
        return (
            hours * 60 * 60 * 1000 +
            minutes * 60 * 1000 +
            seconds * 1000
        );
    }

    private withinActivityHours(): boolean {
        const now = new Date();
    
        const current =
            now.getHours() * 60 * 60 * 1000 +
            now.getMinutes() * 60 * 1000 +
            now.getSeconds() * 1000;
    
        const masterStart = this.parseTime(this.generalSettings.activityHours.master.start);
        const masterEnd = this.parseTime(this.generalSettings.activityHours.master.end);
    
        if (current < masterStart || current > masterEnd)
            return false;
    
        for (const exclude of this.generalSettings.activityHours.excludes) {
            const excludeStart = this.parseTime(exclude.start);
            const excludeEnd = this.parseTime(exclude.end);
    
            if (current >= excludeStart && current <= excludeEnd)
                return false;
        }
    
        return true;
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

    private async updateLoginState(): Promise<void> {
        const shouldBeActive = this.withinActivityHours();

        if (this.updatingLoginState) return;
    
        if (!shouldBeActive) {
            if (this.loggedIn) {
                this.updatingLoginState = true;

                const username = await this.chatBackend.getUsername();
                await this.chatBackend.logout();
    
                this.loggedIn = false;
                this.lastLogoutAt = Date.now();
    
                console.log(`Logged out @${username} - outside of activity hours`);
                
                this.updatingLoginState = false;
            }
    
            return;
        }
    
        if (!this.loggedIn) {
            // immediatte login-after-logout prevention
            if (
                this.lastLogoutAt !== 0 &&
                Date.now() - this.lastLogoutAt < this.generalSettings.loginAfter
            ) {
                return;
            }
    
            this.updatingLoginState = true;

            await this.chatBackend.login();
            const username = await this.chatBackend.getUsername();
    
            this.loggedIn = true;
            this.chattingWith = [];
            this.updatingLoginState = false;
    
            console.log(`Logged in @${username}`);
    
            if (this.generalSettings.sendHiMessageAfterLogin) {
                await this.sendHiMessage();
            }
    
            return;
        }
    
        if (
            this.lastBotMessageAt !== 0 &&
            Date.now() - this.lastBotMessageAt >= this.generalSettings.logoutAfter
        ) {
            this.updatingLoginState = true;
            const username = await this.chatBackend.getUsername();
            await this.chatBackend.logout();
    
            this.loggedIn = false;
            this.lastLogoutAt = Date.now();
            this.updatingLoginState = false;
    
            console.log(`Logged out @${username} - inactive for too long`);
        }
    }

    private isChannelAllowed(channelId: string): boolean {
        if (this.chatSettings.allowedChannels == '*')
            return true;

        if (!this.chatSettings.allowedChannels.includes(channelId))
            return false;

        return true;
    }

    private async sendHiMessage(): Promise<void> {
        if (!this.lastActiveChannel)
            return;
    
        const response = await this.aiBackend.generateResponse({
            prompt: 'hi',
            systemPrompt: this.aiSettings.systemPrompt.join('\n'),
            context: await this.lastActiveChannel.fetchContext(20),
            submodel: this.aiSettings.submodel,
            tools: []
        });
    
        if (!response)
            return;
    
        await this.sendMessage(response, this.lastActiveChannel);
    }

    private async sendMessage(
        contents: string, channel: ChatMessage['channel'], msg?: ChatMessage
    ) {
        if (contents.includes('---ignore-message'))
            return console.log('Model volountairly decided to not generate a response for message.');

        let first = true;
        let lastSentMessage: ChatMessage | null = null;

        for (const singularText of contents.split('\n')) {
            if (!singularText.trim())
                continue;
            
            if (!this.loggedIn || this.updatingLoginState) return;

            const neededTime = singularText.split(' ').length * 0.8 * 1000;
            await this.waitNeededTime(
                neededTime, () => channel.sendTyping(),
                this.chatSettings.sendTypingInterval
            );
            
            this.lastBotMessageAt = Date.now();

            if (!this.loggedIn || this.updatingLoginState) return;

            if (first && msg) {
                lastSentMessage = await msg.reply(singularText);
                first = false;
                continue;
            } else if (msg && this.typingState.get(msg.id)?.newerMessageSent) {
                lastSentMessage = await lastSentMessage!.reply(singularText);

                this.typingState.set(msg.id, { newerMessageSent: false });
            } else lastSentMessage = await channel.send(singularText);
        }
    }

    // TODO: move message handler from init to a separate function
    public async init() {
        await Promise.resolve();

        await this.updateLoginState();
        
        setInterval(
            () => {
                this.updateLoginState();
            },
            500
        );

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

            if (
                !(Math.random() < (this.generalSettings.idleActivityMeter / 100)) &&
                !this.chattingWith.includes(msg.author.id) &&
                !msg.userMentions.includes(msg.externalInformation.selfUserId)
            ) return console.log('Activity meter - ignored message', msg.text);

            this.typingState.set(msg.id, { newerMessageSent: false });

            if (!this.chattingWith.includes(msg.author.id)) {
                this.chattingWith.push(msg.author.id);
            }

            try {
                const response = await this.aiBackend.generateResponse({
                    prompt: msg.text,
                    systemPrompt: this.aiSettings.systemPrompt.join('\n'),
                    context: await msg.channel.fetchContext(20),
                    submodel: this.aiSettings.submodel,
                    tools: []
                });

                if (!response) {
                    console.log(
                        `AI failed to reply to message "${msg.text}", responseText is false-ish`
                    );
                    return;
                }

                await this.sendMessage(response, msg.channel, msg);
                this.lastActiveChannel = msg.channel;
            } finally {
                this.typingState.delete(msg.id);
            }
        });
    }
};
