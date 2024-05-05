"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const directory_1 = __importDefault(require("./directory"));
const file_1 = __importDefault(require("./file"));
class FileSystem {
    constructor() {
        this.root = new directory_1.default('/');
        this.currentDirectory = this.root;
    }
    createFile(name, content = '') {
        let file = new file_1.default(name, content);
        this.currentDirectory.addFile(file);
    }
    readFile(name) {
        let file = this.currentDirectory.getFile(name);
        return file.read();
    }
    appendToFile(name, content) {
        let file = this.currentDirectory.getFile(name);
        file.append(content);
    }
    createDirectory(name) {
        let directory = new directory_1.default(name);
        this.currentDirectory.addFile(directory);
    }
    changeDirectory(name) {
        let directory = this.currentDirectory.getFile(name);
        if (directory) {
            this.currentDirectory = directory;
        }
    }
}
exports.default = FileSystem;
