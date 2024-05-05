"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const filesystem_1 = __importDefault(require("./filesystem"));
const commandregistry_1 = __importDefault(require("./commandregistry"));
const lscommand_1 = __importDefault(require("./lscommand"));
const pwdcommand_1 = __importDefault(require("./pwdcommand"));
const mkdircommand_1 = __importDefault(require("./mkdircommand"));
const touchcommand_1 = __importDefault(require("./touchcommand"));
const catcommand_1 = __importDefault(require("./catcommand"));
const echocommand_1 = __importDefault(require("./echocommand"));
let commandRegistry = new commandregistry_1.default();
commandRegistry.registerCommand('ls', new lscommand_1.default());
commandRegistry.registerCommand('pwd', new pwdcommand_1.default());
commandRegistry.registerCommand('mkdir', new mkdircommand_1.default());
commandRegistry.registerCommand('touch', new touchcommand_1.default());
commandRegistry.registerCommand('cat', new catcommand_1.default());
commandRegistry.registerCommand('echo', new echocommand_1.default());
const fileSystem = new filesystem_1.default();
fileSystem.createFile('file1', 'content1');
fileSystem.createFile('file2', 'content2');
fileSystem.createFile('file3', 'content3');
function handleCommand(cmd) {
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
                currentOutput = currentCommand.run(args, fileSystem);
            }
            else {
                currentOutput = currentCommand.run(previousOutput.split(' '), fileSystem);
            }
        }
        else {
            currentOutput = 'command not found';
        }
        output += '$ ' + command + '\n' + currentOutput + '\n';
        previousOutput = currentOutput;
    }
    return output;
}
const app = (0, express_1.default)();
const port = 3000;
app.use(express_1.default.json());
app.post('/execute', (req, res) => {
    const { command } = req.body;
    let result = handleCommand(command);
    res.send(result);
});
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});
