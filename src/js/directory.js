"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const file_1 = __importDefault(require("./file"));
class Directory extends file_1.default {
    constructor(name) {
        super(name);
        this.files = {};
    }
    addFile(file) {
        this.files[file.name] = file;
    }
    removeFile(name) {
        delete this.files[name];
    }
    getFile(name) {
        return this.files[name];
    }
    read() {
        let output = '';
        for (let name in this.files) {
            output += name + '\n';
        }
        return output;
    }
}
exports.default = Directory;
