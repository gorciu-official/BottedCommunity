import { Client, Message } from "discord.js-selfbot-v13";
import ChatBackend, { ChatMessage } from "./common.ts";

export default class DiscordSelfbotChatBackend extends ChatBackend {
    private client: Client;
    private token: string = null!;

    constructor() {
        super();
        this.client = new Client();
    }

    override async login(): Promise<void> {
        await this.client.login(this.token);
    }

    override logout(): Promise<void> {
        this.client.destroy();
        return Promise.resolve();
    }

    override init(token: string): Promise<void> {
        this.token = token;
        return Promise.resolve();
    }

    override async getUsername(): Promise<string> {
        await Promise.resolve();
        return this.client.user!.username;
    }

    private transformMsg(msg: Message): ChatMessage {
        return { 
            text: 
                msg.content.replaceAll(
                    /<@!?(?<id>\d{17,20})>/g, (found) => {
                        const member = msg.mentions.members?.get(found);
                        if (!member) return `<@${found}>`;

                        const res = this.pingToDesc(found, member.displayName, member.user.username);
                        console.log(res);
                        return res;
                    }
                ), 
            id: msg.id,
            author: { id: msg.author.id, username: msg.author.username, displayName: msg.member?.displayName ?? msg.author.displayName },
            externalInformation: { selfUserId: msg.client.user!.id },
            userMentions: msg.mentions.users.keys().toArray(),
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
                    collection.reverse();
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
