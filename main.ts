import { AgentProcess } from './src/process/agent-process.js';

let profile = './andy.json';
let load_memory = false;
let init_message = 'Say hello world and your name.';

new AgentProcess().start(profile, load_memory, init_message);
//new AgentProcess().start(profile2, load_memory, init_message);
//new comment