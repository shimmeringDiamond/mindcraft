import {Bot} from "mineflayer";
import { initBot } from '../utils/mcdata.js';
import TypedEmiter from "typed-emitter"
import EventEmitter from "events"
import {ModeController} from "./modes";
import {Agent} from "./agent";

interface AgentBotEvents {
    idle: () => void;
}

//class for custom events and attributes that are tied to the bot
export class AgentBot {
    agent: Agent; bot: Bot; interrupt_code: boolean; output: string; emitter: TypedEmiter<AgentBotEvents>; modes: ModeController
    constructor(agent: Agent) {
        this.agent = agent
        this.modes = new ModeController(this.agent)
        this.bot = initBot(this.agent.name)
        this.output = '';
        this.interrupt_code = false;
        this.emitter = new EventEmitter() as TypedEmiter<AgentBotEvents>
    }
}