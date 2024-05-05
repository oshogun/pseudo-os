import express from 'express';

import FileSystem from './filesystem';
import CommandRegistry from './commandregistry';
import LsCommand from './commands/lscommand';
import PwdCommand from './commands/pwdcommand';
import MkdirCommand from './commands/mkdircommand';
import TouchCommand from './commands/touchcommand';
import CatCommand from './commands/catcommand';
import EchoCommand from './commands/echocommand';


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
        let command = commands[i];
        let redirectSymbol = command.includes('>>') ? '>>' : command.includes('>') ? '>' : null;
        let fileName = '';


        if (redirectSymbol) {
            const parts = command.split(redirectSymbol);
            command = parts[0];
            fileName = parts[1].trim();
        }

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

            if (redirectSymbol) {
                if (redirectSymbol === '>') {

                    fileSystem.createFile(fileName, currentOutput);
                } else {

                    fileSystem.appendToFile(fileName, currentOutput);
                }
                currentOutput = '';
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