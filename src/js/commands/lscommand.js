"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = __importDefault(require("../command"));
class LsCommand extends command_1.default {
    constructor() {
        super(...arguments);
        this.run = (args, fileSystem) => {
            let output = '';
            output = fileSystem.currentDirectory.read();
            return output;
        };
    }
}
exports.default = LsCommand;
