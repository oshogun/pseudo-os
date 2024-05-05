"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = __importDefault(require("./command"));
const directory_1 = __importDefault(require("./directory"));
class CatCommand extends command_1.default {
    constructor() {
        super(...arguments);
        this.run = (args, fileSystem) => {
            let output = '';
            const file = fileSystem.currentDirectory.getFile(args[0]);
            if (file instanceof directory_1.default) {
                return 'cat: ' + args[0] + ': Is a directory';
            }
            if (file) {
                output = file.read();
            }
            else {
                output = 'file not found';
            }
            return output;
        };
    }
}
exports.default = CatCommand;
