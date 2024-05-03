import {turn} from "../agent/history";

export interface Model {
    model_name: string;
    sendRequest: (turns: turn[], systemMessage: string, stop_seq?: string) => Promise<string | null>;
    embed: (text: string) => Promise<number[]>;
}