import { writeFileSync, readFileSync } from 'fs';
import {Agent} from "./agent";

export interface turn {
    role: string;
    content: string;
}
export class History {
    agent: Agent; name: string; memory_fp: string; turns: turn[]; memory: string; max_messages: number;
    constructor(agent: Agent) {
        this.agent = agent;
        this.name = agent.name;
        this.memory_fp = `./bots/${this.name}/memory.json`;
        this.turns = [];

        // These define an agent's long term memory
        this.memory = '';

        // Variables for controlling the agent's memory and knowledge
        this.max_messages = 20;
    }

    getHistory() { // expects an Examples object
        return JSON.parse(JSON.stringify(this.turns));
    }

    async storeMemories(turns: turn[]) {
        console.log("Storing memories...");
        this.memory = await this.agent.prompter.promptMemSaving(this.memory, turns)?? "";
        console.log("Memory updated to: ", this.memory);
    }

    async add(name: string, content: string) {
        let role = 'assistant';
        if (name === 'system') {
            role = 'system';
        }
        else if (name !== this.name) {
            role = 'user';
            content = `${name}: ${content}`;
        }
        this.turns.push({role, content});

        // Summarize older turns into memory
        if (this.turns.length >= this.max_messages) {
            let to_summarize = [this.turns.shift()];
            while (this.turns[0].role != 'user' && this.turns.length > 1)
                to_summarize.push(this.turns.shift());
            await this.storeMemories(to_summarize as turn[]);
        }
    }

    save() {
        // save history object to json file
        let data = {
            'name': this.name,
            'memory': this.memory,
            'turns': this.turns
        };
        const json_data = JSON.stringify(data, null, 4);
        try {
            writeFileSync(this.memory_fp, json_data);
            console.log("JSON data is saved");
        } catch (err) {
            throw err;
        }
    }

    load() {
        try {
            // load history object from json file
            const data = readFileSync(this.memory_fp, 'utf8');
            const obj = JSON.parse(data);
            this.memory = obj.memory;
            this.turns = obj.turns;
        } catch (err) {
            console.error(`No memory file '${this.memory_fp}' for agent ${this.name}.`);
        }
    }

    clear() {
        this.turns = [];
        this.memory = '';
    }
}