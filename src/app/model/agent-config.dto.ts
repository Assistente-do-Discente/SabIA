export interface ToolConfig {
    name: string
    description: string
    parameters: Record<string, ParameterConfig>
}

export interface ParameterConfig {
    type: string,
    clazz: string,
    description: string,
    possibleValues: string[]
}

export interface CachedTools {
    expiresAt: number
    tools: Array<ToolConfig>
}