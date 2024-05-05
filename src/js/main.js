"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const commandregistry_1 = __importDefault(require("./commandregistry"));
const filesystem_1 = __importDefault(require("./filesystem"));
const lscommand_1 = __importDefault(require("./lscommand"));
let commandRegistry = new commandregistry_1.default();
commandRegistry.registerCommand('ls', new lscommand_1.default());
let fileSystem = new filesystem_1.default();
function handleCommand(cmd, args) {
    let command = commandRegistry.getCommand(cmd);
    if (command) {
        let output = command.run(args, fileSystem); // Cast fileSystem to FileSystem type
        console.log('$ ' + cmd + '\n' + output + '\n');
    }
    else {
        console.log('$ ' + cmd + '\n' + 'command not found' + '\n');
    }
}
// For testing
fileSystem.createFile('file1', 'content1');
fileSystem.createFile('file2', 'content2');
fileSystem.createFile('file3', 'content3');
handleCommand('ls', []);
