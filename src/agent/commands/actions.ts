import * as skills from '../library/skills.js';
import settings from '../../settings.js';
import {Agent} from "../agent";

interface action {
    name: string;
    description: string;
    params?:
    perform: (agent: Agent) => Promise<string | null>;
}
function wrapExecution(func, timeout=-1, resume_name=null) {
    return async function (agent: Agent, ...args) {
        let code_return;
        if (resume_name != null) {
            code_return = await agent.coder.executeResume(async () => {
                await func(agent, ...args);
            }, resume_name, timeout);
        } else {
            code_return = await agent.coder.execute(async () => {
                await func(agent, ...args);
            }, timeout);
        }
        if (code_return.interrupted && !code_return.timedout)
            return;
        return code_return.message;
    }
}

export const actionsList: [action] = [
    {
        name: '!newAction',
        description: 'Perform new and unknown custom behaviors that are not available as a command by writing code.', 
        perform: async function (agent: Agent) {
            if (!settings.allow_insecure_coding)
                return 'newAction Failed! Agent is not allowed to write code. Notify the user.';
            return await agent.coder.generateCode(agent.history);
        }
    },
    {
        name: '!stop',
        description: 'Force stop all actions and commands that are currently executing.',
        perform: async function (agent: Agent) {
            await agent.coder.stop();
            agent.coder.clear();
            agent.coder.cancelResume();
            return 'Agent stopped.';
        }
    },
    {
        name: '!restart',
        description: 'Restart the agent process.',
        perform: async function (agent: Agent) {
            process.exit(1);
        }
    },
    {
        name: '!clearChat',
        description: 'Clear the chat history.',
        perform: async function (agent: Agent) {
            agent.history.clear();
            return agent.name + "'s chat history was cleared, starting new conversation from scratch.";
        }
    },
    {
        name: '!setMode',
        description: 'Set a mode to on or off. A mode is an automatic behavior that constantly checks and responds to the environment.',
        params: {
            'mode_name': '(string) The name of the mode to enable.',
            'on': '(bool) Whether to enable or disable the mode.'
        },
        perform: async function (agent: Agent, mode_name, on) {
            const modes = agent.bot.modes;
            if (!modes.exists(mode_name))
                return `Mode ${mode_name} does not exist.` + modes.getStr();
            if (modes.isOn(mode_name) === on)
                return `Mode ${mode_name} is already ${on ? 'on' : 'off'}.`;
            modes.setOn(mode_name, on);
            return `Mode ${mode_name} is now ${on ? 'on' : 'off'}.`;
        }
    },
    {
        name: '!goToPlayer',
        description: 'Go to the given player.',
        params: {
            'player_name': '(string) The name of the player to go to.',
            'closeness': '(number) How close to get to the player.'
        },
        perform: wrapExecution(async (agent: Agent, player_name, closeness) => {
            return await skills.goToPlayer(agent.bot, player_name, closeness);
        })
    },
    {
        name: '!followPlayer',
        description: 'Endlessly follow the given player. Will defend that player if self_defense mode is on.',
        params: {
            'player_name': '(string) The name of the player to follow.',
            'follow_dist': '(number) The distance to follow from.'
        },
        perform: wrapExecution(async (agent: Agent, player_name, follow_dist) => {
            await skills.followPlayer(agent.bot, player_name, follow_dist);
        }, -1, 'followPlayer')
    },
    {
        name: '!moveAway',
        description: 'Move away from the current location in any direction by a given distance.',
        params: {'distance': '(number) The distance to move away.'},
        perform: wrapExecution(async (agent, distance) => {
            await skills.moveAway(agent.bot, distance);
        })
    },
    {
        name: '!givePlayer',
        description: 'Give the specified item to the given player.',
        params: { 
            'player_name': '(string) The name of the player to give the item to.', 
            'item_name': '(string) The name of the item to give.' ,
            'num': '(number) The number of items to give.'
        },
        perform: wrapExecution(async (agent: Agent, player_name, item_name, num) => {
            await skills.giveToPlayer(agent.bot, item_name, player_name, num);
        })
    },
    {
        name: '!collectBlocks',
        description: 'Collect the nearest blocks of a given type.',
        params: {
            'type': '(string) The block type to collect.',
            'num': '(number) The number of blocks to collect.'
        },
        perform: wrapExecution(async (agent: Agent, type, num) => {
            await skills.collectBlock(agent.bot, type, num);
        }, 10) // 10 minute timeout
    },
    {
        name: '!collectAllBlocks',
        description: 'Collect all the nearest blocks of a given type until told to stop.',
        params: {
            'type': '(string) The block type to collect.'
        },
        perform: wrapExecution(async (agent: Agent, type) => {
            let success = await skills.collectBlock(agent.agentBot.bot, type, 1);
            if (!success)
                agent.coder.cancelResume();
        }, 10, 'collectAllBlocks') // 10 minute timeout
    },
    {
        name: '!craftRecipe',
        description: 'Craft the given recipe a given number of times.',
        params: {
            'recipe_name': '(string) The name of the output item to craft.',
            'num': '(number) The number of times to craft the recipe. This is NOT the number of output items, as it may craft many more items depending on the recipe.'
        },
        perform: wrapExecution(async (agent: Agent, recipe_name: string, num: number) => {
            await skills.craftRecipe(agent.agentBot.bot, recipe_name, num);
        })
    },
    {
        name: '!smeltItem',
        description: 'Smelt the given item the given number of times.',
        params: {
            'item_name': '(string) The name of the input item to smelt.',
            'num': '(number) The number of times to smelt the item.'
        },
        perform: wrapExecution(async (agent: Agent, recipe_name: string, num: number) => {
            await skills.smeltItem(agent.agentBot.bot, recipe_name, num);
        })
    },
    {
        name: '!placeHere',
        description: 'Place a given block in the current location. Do NOT use to build structures, only use for single blocks/torches.',
        params: {'type': '(string) The block type to place.'},
        perform: wrapExecution(async (agent:Agent, type) => {
            let pos = agent.agentBot.bot.entity.position;
            await skills.placeBlock(agent.agentBot.bot, type, pos.x, pos.y, pos.z);
        })
    },
    {
        name: '!attack',
        description: 'Attack and kill the nearest entity of a given type.',
        params: {'type': '(string) The type of entity to attack.'},
        perform: wrapExecution(async (agent: Agent, type) => {
            await skills.attackNearest(agent.agentBot.bot, type, true);
        })
    },
    {
        name: '!goToBed',
        description: 'Go to the nearest bed and sleep.',
        perform: wrapExecution(async (agent: Agent) => {
            await skills.goToBed(agent.agentBot.bot);
        })
    },
    {
        name: '!stay',
        description: 'Stay in the current location no matter what. Pauses all modes.',
        perform: wrapExecution(async (agent: Agent) => {
            await skills.stay(agent.agentBot.bot);
        })
    }
];
