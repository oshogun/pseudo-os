import Directory from "./directory";
import File from "./file";

class FileSystem {
    root: Directory;
    currentDirectory: Directory;

    constructor() {
        this.root = new Directory('/');
        this.currentDirectory = this.root;
    }

    createFile(name: string, content = ''): void {
        let file = new File(name, content);
        this.currentDirectory.addFile(file);    
    }

    readFile(name: string): string {
        let file = this.currentDirectory.getFile(name);
        return file.read();
    }

    appendToFile(name: string, content: string): void {
        let file = this.currentDirectory.getFile(name);
        file.append(content);
    }	

    createDirectory(name: string): void {
        let directory = new Directory(name);
        this.currentDirectory.addFile(directory);
    }	

    changeDirectory(name: string): void {
        let directory = this.currentDirectory.getFile(name) as Directory;
        if (directory) {
            this.currentDirectory = directory;
        }
    } 

    // Implement other methods...
}

export default FileSystem;