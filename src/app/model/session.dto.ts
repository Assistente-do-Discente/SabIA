export type SessionDTO = {
    sessionId: string;
    studentUuid?: string;
    institutionId?: string;
    accessToken?: string;
    refreshToken?: string;
    expireIn?: number;
    createdAt: number;
    updatedAt: number;
};

export type AuthState = {
    state: string;
    codeVerifier: string;
    sessionId: string;
};