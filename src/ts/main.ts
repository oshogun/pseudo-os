import CommandRegistry from "./commandregistry";
import FileSystem from "./filesystem";
import LsCommand from "./commands/lscommand";


let commandRegistry = new CommandRegistry();
commandRegistry.registerCommand('ls', new LsCommand());
let fileSystem = new FileSystem();

function handleCommand(cmd: string, args: string[]): void {
    let command = commandRegistry.getCommand(cmd);
    if (command) {
        let output = command.run(args, fileSystem as FileSystem); // Cast fileSystem to FileSystem type
        console.log('$ ' + cmd + '\n' + output + '\n');
    } else {
        console.log('$ ' + cmd + '\n' + 'command not found' + '\n');
    }
}


// For testing
fileSystem.createFile('file1', 'content1');
fileSystem.createFile('file2', 'content2');
fileSystem.createFile('file3', 'content3');
handleCommand('ls', []);
