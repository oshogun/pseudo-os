"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const command_1 = __importDefault(require("./command"));
class EchoCommand extends command_1.default {
    constructor() {
        super(...arguments);
        this.run = (args) => {
            return args.join(' ');
        };
    }
}
exports.default = EchoCommand;
