import Command from "../command";
import FileSystem from "../filesystem";

class CdCommand extends Command {
    private fs: FileSystem;
    constructor(fileSystem: FileSystem) {
        super();
        this.fs = fileSystem;
    }
    run = (args: string[]): string => {
        if (args.length !== 1) {
            return 'Usage: cd <directory>';
        }
        const directory = args[0];
        if (directory === '.') {
            return `cd ${args.join(' ')}`;
        } else if (directory === '..') {
            this.fs.changeDirectory('..');
            return `cd ${args.join(' ')}`;
        } else {
            this.fs.changeDirectory(directory);
            return `cd ${args.join(' ')}`;
        }
    }
    
}

export default CdCommand;