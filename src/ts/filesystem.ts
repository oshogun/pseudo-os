import Directory from "./directory";
import File from "./file";

class FileSystem {
    root: Directory;
    currentDirectory: Directory;


    constructor() {
        this.root = new Directory('/', null);
        this.currentDirectory = this.root;
  
    }

    createFile(name: string, content = ''): void {
        let file = new File(name, content, this.currentDirectory);
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
        let directory = new Directory(name, this.currentDirectory);
        this.currentDirectory.addFile(directory);
    }

    changeDirectory(name: string): string {
        if (name === '..') {	
            if (this.currentDirectory.parent) {
                this.currentDirectory = this.currentDirectory.parent;
                return '';
            } else {
                return '';
            }
        }
        let directory = this.currentDirectory.getFile(name);
        if (directory instanceof Directory) {
            this.currentDirectory = directory;
            return '';
        } else {
            return 'cd: ' + name + ': Not a directory';
        }
        
    }

    // Implement other methods...
}

export default FileSystem;