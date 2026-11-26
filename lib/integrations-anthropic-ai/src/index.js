import Anthropic from "@anthropic-ai/sdk";
let cachedClient = null;
function resolveApiKey() {
    return (process.env.ANTHROPIC_API_KEY ||
        process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY);
}
export function getAnthropic() {
    if (cachedClient)
        return cachedClient;
    const apiKey = resolveApiKey();
    if (!apiKey) {
        throw new Error("Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable.");
    }
    cachedClient = new Anthropic({ apiKey });
    return cachedClient;
}
// Keep backward compatibility with existing imports (`import { anthropic } ...`)
// but avoid throwing at module import time when API key is not configured.
export const anthropic = new Proxy({}, {
    get(_target, prop, receiver) {
        const client = getAnthropic();
        const value = Reflect.get(client, prop, receiver);
        return typeof value === "function" ? value.bind(client) : value;
    },
});
