"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class File {
    constructor(name, content = '') {
        this.name = name;
        this.content = content;
    }
    read() {
        return this.content;
    }
    write(content) {
        this.content = content;
    }
    append(content) {
        this.content += content;
    }
}
exports.default = File;
