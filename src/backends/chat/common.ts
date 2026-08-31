export interface ChatMessage {
    text: string;
    id: string;
    channel: {
        id: string;
        sendTyping: () => void,
        send: (msg: string) => Promise<ChatMessage>,
        fetchContext: (size: number) => Promise<ChatMessage[]>
    },
    userMentions: string[],
    author: {
        id: string;
        displayName: string;
        username: string;
    }
    externalInformation: {
        selfUserId: string;
    },
    reply: (msg: string) => Promise<ChatMessage>
}

export default abstract class ChatBackend {
    abstract init(token: string): Promise<void>;
    abstract setMessageHandler(handler: (msg: ChatMessage) => unknown): void;
    abstract getUsername(): Promise<string>;
    abstract login(): Promise<void>;
    abstract logout(): Promise<void>;

    protected pingToDesc(username: string, displayName: string, id: string) {
        return `[PING: ${displayName} (${username}), id: ${id}]`;
    }
}
