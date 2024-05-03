import * as skills from './library/skills.js';
import * as world from './library/world.js';
import * as mc from '../utils/mcdata.js';
import {Agent} from "./agent";
import {Entity} from "prismarine-entity";


// a mode is a function that is called every tick to respond immediately to the world
// it has the following fields:
// on: whether 'update' is called every tick
// active: whether an action has been triggered by the mode and hasn't yet finished
// paused: whether the mode is paused by another action that overrides the behavior (eg followplayer implements its own self defense)
// update: the function that is called every tick (if on is true)
// when a mode is active, it will trigger an action to be performed but won't wait for it to return output

// the order of this list matters! first modes will be prioritized
// while update functions are async, they should *not* be awaited longer than ~100ms as it will block the update loop
// to perform longer actions, use the execute function which won't block the update loop
interface  mode {
    name: string;
    description: string;
    interrupts: string[];
    on: boolean;
    active: boolean;
    update: (agent: Agent) => void;
    paused: boolean;

    wait?: number;
    prev_item?: Entity | null;
    noticed_at?: number;

    staring?: boolean;
    last_entity?: null | Entity;
    next_change?: number;
}
const modes: mode[] = [
    {
        name: 'self_defense',
        description: 'Automatically attack nearby enemies. Interrupts other actions.',
        interrupts: ['all'],
        on: true,
        paused: false,
        active: false,
        update: async function (agent: Agent) {
            const enemy = world.getNearestEntityWhere(agent.agentBot.bot, entity => mc.isHostile(entity), 9);
            if (enemy && await world.isClearPath(agent.agentBot.bot, enemy)) {
                agent.agentBot.bot.chat(`Fighting ${enemy.name}!`);
                void execute(this, agent, async () => {
                    await skills.defendSelf(agent.agentBot.bot, 9);
                });
            }
        }
    },
    {
        name: 'hunting',
        description: 'Automatically hunt nearby animals when idle.',
        interrupts: ['defaults'],
        on: true,
        paused: false,
        active: false,
        update: async function (agent: Agent) {
            const huntable = world.getNearestEntityWhere(agent.agentBot.bot, entity => mc.isHuntable(entity), 8);
            if (huntable && await world.isClearPath(agent.agentBot.bot, huntable)) {
                void execute(this, agent, async () => {
                    agent.agentBot.bot.chat(`Hunting ${huntable.name}!`);
                    await skills.attackEntity(agent.agentBot.bot, huntable);
                });
            }
        }
    },
    {
        name: 'item_collecting',
        description: 'Automatically collect nearby items when idle.',
        interrupts: ['followPlayer'],
        on: true,
        paused: false,
        active: false,

        wait: 2, // number of seconds to wait after noticing an item to pick it up
        prev_item: null,
        noticed_at: -1,
        update: async function (agent: Agent) {
            let item = world.getNearestEntityWhere(agent.agentBot.bot, entity => entity.name === 'item', 8);
            if (item && item !== this.prev_item && await world.isClearPath(agent.agentBot.bot, item)) {
                if (this.noticed_at === -1) {
                    this.noticed_at = Date.now();
                }
                if (Date.now() - this.noticed_at! > this.wait! * 1000) {
                    agent.agentBot.bot.chat(`Picking up ${item.name}!`);
                    this.prev_item = item;
                    void execute(this, agent, async () => {
                        await skills.pickupNearbyItems(agent.agentBot.bot);
                    });
                    this.noticed_at = -1;
                }
            }
            else {
                this.noticed_at = -1;
            }
        }
    },
    {
        name: 'torch_placing',
        description: 'Automatically place torches when idle and there are no torches nearby.',
        interrupts: ['followPlayer'],
        on: true,
        paused: false,
        active: false,
        update: function (agent: Agent) {
            // TODO: check light level instead of nearby torches, block.light is broken
            const near_torch = world.getNearestBlock(agent.agentBot.bot, 'torch', 6);
            if (!near_torch) {
                let torches = agent.agentBot.bot.inventory.items().filter(item => item.name.includes('torch'));
                if (torches.length > 0) {
                    const torch = torches[0];
                    const pos = agent.agentBot.bot.entity.position;
                    void execute(this, agent, async () => {
                        await skills.placeBlock(agent.agentBot.bot, torch.name, pos.x, pos.y, pos.z);
                    });
                }
            }
        }
    },
    {
        name: 'idle_staring',
        description: 'Non-functional animation to look around at entities when idle.',
        interrupts: [],
        on: true,
        paused: false,
        active: false,

        staring: false,
        last_entity: null,
        next_change: 0,
        update: function (agent: Agent) {
            const entity: Entity | null = agent.agentBot.bot.nearestEntity();
            let entity_in_view = entity && entity.position.distanceTo(agent.agentBot.bot.entity.position) < 10 && entity.name !== 'enderman';
            if (entity_in_view && entity !== this.last_entity) {
                this.staring = true;
                this.last_entity = entity;
                this.next_change = Date.now() + Math.random() * 1000 + 4000;
            }
            if (entity_in_view && this.staring) {
                let isbaby = entity!.type !== 'player' && entity!.metadata[16];
                let height = isbaby ? entity!.height/2 : entity!.height;
                void agent.agentBot.bot.lookAt(entity!.position.offset(0, height, 0));
            }
            if (!entity_in_view)
                this.last_entity = null;
            if (Date.now() > this.next_change!) {
                // look in random direction
                this.staring = Math.random() < 0.3;
                if (!this.staring) {
                    const yaw = Math.random() * Math.PI * 2;
                    const pitch = (Math.random() * Math.PI/2) - Math.PI/4;
                    agent.agentBot.bot.look(yaw, pitch, false);
                }
                this.next_change = Date.now() + Math.random() * 10000 + 2000;
            }
        }
    },
];

async function execute(mode: mode, agent: Agent, func: () => Promise<void>, timeout=-1) {
    mode.active = true;
    let code_return = await agent.coder.execute(async () => {
        await func();
    }, timeout);
    mode.active = false;
    console.log(`Mode ${mode.name} finished executing, code_return: ${code_return.message}`);
}

export class ModeController {
    agent: Agent; modes_list: mode[]; modes_map: {[key: string]: mode}
    constructor(agent: Agent) {
        this.agent = agent;
        this.modes_list = modes;
        this.modes_map = {};
        for (let mode of this.modes_list) {
            this.modes_map[mode.name] = mode;
        }
    }

    exists(mode_name: string) {
        return this.modes_map[mode_name] != null;
    }

    setOn(mode_name: string, on: boolean) {
        this.modes_map[mode_name].on = on;
    }

    isOn(mode_name: string) {
        return this.modes_map[mode_name].on;
    }

    pause(mode_name: string) {
        this.modes_map[mode_name].paused = true;
    }

    getStr() {
        let res = 'Available Modes:';
        for (let mode of this.modes_list) {
            let on = mode.on ? 'ON' : 'OFF';
            res += `\n- ${mode.name}(${on}): ${mode.description}`;
        }
        return res;
    }

    unPauseAll() {
        for (let mode of this.modes_list) {
            if (mode.paused) console.log(`Unpausing mode ${mode.name}`);
            mode.paused = false;
        }
    }

    async update() {
        if (this.agent.isIdle()) {
            this.unPauseAll();
        }
        for (let mode of this.modes_list) {
            let available = mode.interrupts.includes('all') || this.agent.isIdle();
            let interruptible = this.agent.coder.interruptible && (mode.interrupts.includes('defaults') || mode.interrupts.includes(this.agent.coder.resume_name??""));
            if (mode.on && !mode.paused && !mode.active && (available || interruptible)) {
                mode.update(this.agent);
            }
            if (mode.active) break;
        }
    }
}

export function initModes(agent: Agent) {
    // the mode controller is added to the bot object so it is accessible from anywhere the bot is used
    agent.agentBot.modes = new ModeController(agent);
}
