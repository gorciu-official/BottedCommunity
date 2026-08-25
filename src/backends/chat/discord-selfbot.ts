import { Client, Message } from "discord.js-selfbot-v13";
import ChatBackend, { ChatMessage } from "./common.ts";

export default class DiscordSelfbotChatBackend extends ChatBackend {
    private client: Client;

    constructor() {
        super();
        this.client = new Client();
    }

    override async init(token: string): Promise<void> {
        await this.client.login(token);
    }

    private transformMsg(msg: Message): ChatMessage {
        return { 
            text: msg.content, id: msg.id,
            author: { id: msg.author.id, username: msg.author.username, displayName: msg.member?.displayName ?? msg.author.displayName },
            externalInformation: { selfUserId: msg.client.user!.id },
            channel: {
                id: msg.channel.id,
                sendTyping: () => {
                    msg.channel.sendTyping();
                },
                send: async (newMsg) => {
                    return this.transformMsg(
                        await msg.channel.send(newMsg)
                    );
                },
                fetchContext: async (size) => {
                    const collection = await msg.channel.messages.fetch({ limit: size });
                    return collection
                        .values()
                        .toArray()
                        .map((msg) => this.transformMsg(msg));
                },
            },
            reply: async (newMsg) => {
                return this.transformMsg(
                    await msg.reply(newMsg)
                );
            }
        };
    }

    override setMessageHandler(handler: (msg: ChatMessage) => unknown): void {
        this.client.on('messageCreate', (msg) => {
            handler(this.transformMsg(msg));
        });
    }
}
