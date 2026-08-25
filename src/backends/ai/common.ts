import { ChatMessage } from "../chat/common.ts";

export interface AIGenerateResponseOptions {
    prompt: string,
    systemPrompt: string,
    submodel: string,
    context: ChatMessage[]
}

export default abstract class AIBackend {
    abstract init(apiKey: string): void;
    abstract generateResponse(options: AIGenerateResponseOptions): Promise<string>;

    protected formatChatMessagesToText(msgs: ChatMessage[]) {
        let result = '';
        for (const msg of msgs) {
            result += `${msg.author.displayName} (@${msg.author.username}): ${msg.text}`;
        }
        return result;
    }
}
