import { spawn, ChildProcess } from 'child_process';

export class AgentProcess {
    start(profile: string, load_memory=false, init_message: string = "") {
        let args: string[]  = ['src/process/init-agent.js'];
        args.push('-p', profile);
        if (load_memory)
            args.push('-l', load_memory.toString());
        if (init_message)
            args.push('-m', init_message);
        
        //starts child process to initiate an AIs agent
        const agentProcess: ChildProcess = spawn('node', args, {
            stdio: 'inherit',
        });
        
        let last_restart = Date.now();
        agentProcess.on('exit', (code, signal) => {
            console.log(`Agent process exited with code ${code} and signal ${signal}`);
            
            if (code !== 0) {
                // agent must run for at least 10 seconds before restarting
                if (Date.now() - last_restart < 10000) {
                    console.error('Agent process exited too quickly. Killing entire process. Goodbye.');
                    process.exit(1);
                }
                console.log('Restarting agent...');
                this.start(profile, true, 'Agent process restarted. Notify the user and decide what to do.');
                last_restart = Date.now();
            }
        });
    
        agentProcess.on('error', (err) => {
            console.error('Failed to start agent process:', err);
        });
    }
}