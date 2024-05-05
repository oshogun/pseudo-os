import Command from "./command";
import FileSystem from "./filesystem";

class TouchCommand extends Command {
    run = (args: string[], fileSystem: FileSystem): string => {
        if (args.length < 1) {
            return 'Usage: touch <file> [<file2> ...]';
        }
        
        args.forEach(file => {
            fileSystem.createFile(file);
        });

        return '';
    }
}

export default TouchCommand;