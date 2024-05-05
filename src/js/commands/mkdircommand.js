"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = __importDefault(require("../command"));
class MkdirCommand extends command_1.default {
    constructor() {
        super(...arguments);
        this.run = (args, fileSystem) => {
            if (args.length < 1) {
                return 'Usage: mkdir <directory1> [<directory2> ...]';
            }
            args.forEach(directory => {
                fileSystem.createDirectory(directory);
            });
            return '';
        };
    }
}
exports.default = MkdirCommand;
