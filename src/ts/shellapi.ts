import express from 'express';

import FileSystem from './filesystem';
import CommandRegistry from './commandregistry';
import LsCommand from './lscommand';
import PwdCommand from './pwdcommand';
import MkdirCommand from './mkdircommand';
import TouchCommand from './touchcommand';
import CatCommand from './catcommand';
import EchoCommand from './echocommand';


let commandRegistry = new CommandRegistry();
commandRegistry.registerCommand('ls', new LsCommand());
commandRegistry.registerCommand('pwd', new PwdCommand());
commandRegistry.registerCommand('mkdir', new MkdirCommand());
commandRegistry.registerCommand('touch', new TouchCommand());
commandRegistry.registerCommand('cat', new CatCommand());
commandRegistry.registerCommand('echo', new EchoCommand());

const fileSystem = new FileSystem();
fileSystem.createFile('file1', 'content1');
fileSystem.createFile('file2', 'content2');
fileSystem.createFile('file3', 'content3');


function handleCommand(cmd: string): string {
    const commands = cmd.split('|').map(c => c.trim()); // Split commands by pipe symbol and remove leading/trailing spaces

    let output = '';
    let previousOutput = '';

    for (let i = 0; i < commands.length; i++) {
        const command = commands[i];
        const commandParts = command.match(/(?:[^\s"]+|"[^"]*")+/g); // Split command by spaces, but preserve quoted strings

        if (!commandParts) {
            output += '$ ' + command + '\n' + 'command not found' + '\n';
            break;
        }

        const args = commandParts.slice(1).map(arg => arg.replace(/"/g, '').replace(/\\"/g, '"'));
        let currentOutput = '';

        const commandName = commandParts[0];
        const currentCommand = commandRegistry.getCommand(commandName);

        if (currentCommand) {
            if (i === 0) {
                currentOutput = currentCommand.run(args, fileSystem as FileSystem);
            } else {
                currentOutput = currentCommand.run(previousOutput.split(' '), fileSystem as FileSystem);
            }
        } else {
            currentOutput = 'command not found';
        }

        output += '$ ' + command + '\n' + currentOutput + '\n';
        previousOutput = currentOutput;
    }

    return output;
}
    

const app = express();
const port = 3000;

app.use(express.json());

app.post('/execute', (req: express.Request, res: express.Response) => {
    const { command } = req.body;
    let result: string = handleCommand(command);
    res.send(result);
});


app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});