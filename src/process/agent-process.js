import { spawn } from 'child_process';

export class AgentProcess {
    constructor(profile, load_memory=false, init_message=null) {
        this.profile = profile;
        this.load_memory = load_memory;
        this.init_message = init_message;
    }
    start() {
        let args = ['src/process/init-agent.js', this.name];
        args.push('-p', this.profile);
        if (this.load_memory)
            args.push('-l', this.load_memory);
        if (this.init_message)
            args.push('-m', this.init_message);
        this.agentProcess = spawn('node', args, {
            stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
            stderr: 'inherit',
        });
        
        let last_restart = Date.now();
        this.agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            
            if (code !== 0) {
                // agent must run for at least 10 seconds before restarting
                if (Date.now() - last_restart < 10000) {
                    console.error('Agent process exited too quickly. Killing entire process. Goodbye.');
                    process.exit(1);
                }
                console.log('Restarting agent...');
                this.start(this.profile, true, 'Agent process restarted. Notify the user and decide what to do.');
                last_restart = Date.now();
            }
        });
    
        this.agentProcess.on('error', (err) => {
            console.error('Failed to start agent process:', err);
        });
    }
    //finds the location of bots and reports it to the main program so that communication can happen
}