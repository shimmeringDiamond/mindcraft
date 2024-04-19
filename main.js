import { AgentProcess } from './src/process/agent-process.js';

let profile = './andy.json';
let load_memory = false;
let init_message = 'Say hello world and your name.';

let profile2 = './jeffery.json';
let load_memory2 = false;
let init_message2 = 'Say hello world and your name.';

let andy = new AgentProcess()
let jeffery = new AgentProcess()

andy.start(profile, load_memory, init_message)
jeffery.start(profile2, load_memory2, init_message2)

export const agents = [andy, jeffery]
