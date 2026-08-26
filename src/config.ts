interface BottedMemberActivityHours {
    start: `${number}:${number}:${number}`,
    end: `${number}:${number}:${number}`
}

interface BottedMemberConfig {
    authentication: {
        ai: string,
        chat: string
    },
    general: {
        activityHours: {
            master: BottedMemberActivityHours,
            excludes: BottedMemberActivityHours[]
        };
        loginAfter: number;
        logoutAfter: number;
        idleActivityMeter: number;
        sendHiMessageAfterLogin: boolean;
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

export type { BottedMemberActivityHours, BottedMemberConfig };
