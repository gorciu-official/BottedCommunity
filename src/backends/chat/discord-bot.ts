import { Client, GatewayIntentBits, Message, Partials } from "discord.js";
import ChatBackend, { ChatMessage } from "./common.ts";

export default class DiscordBotChatBackend extends ChatBackend {
    private client: Client;

    constructor() {
        super();
        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
                GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent
            ],
            partials: [
                Partials.Message, Partials.GuildMember
            ]
        });
    }

    override async init(token: string): Promise<void> {
        await this.client.login(token);
    }

    override async getUsername(): Promise<string> {
        await Promise.resolve();
        return this.client.user!.username;
    }

    private transformMsg(msg: Message): ChatMessage {
        return { 
            text: msg.content, id: msg.id,
            author: { id: msg.author.id, username: msg.author.username, displayName: msg.member?.displayName ?? msg.author.displayName },
            externalInformation: { selfUserId: msg.client.user!.id },
            channel: {
                id: msg.channel.id,
                sendTyping: () => {
                    if (!msg.channel.isSendable()) return;
                    msg.channel.sendTyping();
                },
                send: async (newMsg) => {
                    if (!msg.channel.isSendable())
                        throw new Error('not sendable');

                    return this.transformMsg(
                        await msg.channel.send(newMsg)
                    );
                },
                fetchContext: async (size) => {
                    const collection = await msg.channel.messages.fetch({ limit: size });
                    collection.reverse();
                    return collection
                        .values()
                        .toArray()
                        .map((msg) => this.transformMsg(msg));
                },
            },
            reply: async (newMsg) => {
                if (!msg.channel.isSendable())
                    throw new Error('not sendable');

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
