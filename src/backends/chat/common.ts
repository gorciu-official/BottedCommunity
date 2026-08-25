export interface ChatMessage {
    text: string;
    id: string;
    channel: {
        id: string;
        sendTyping: () => void,
        send: (msg: string) => Promise<ChatMessage>,
        fetchContext: (size: number) => Promise<ChatMessage[]>
    }
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
}
