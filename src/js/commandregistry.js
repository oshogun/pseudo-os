"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class CommandRegistry {
    constructor() {
        this.commands = {};
    }
    registerCommand(name, command) {
        this.commands[name] = command;
    }
    getCommand(name) {
        return this.commands[name];
    }
}
exports.default = CommandRegistry;
