import Command from "../command";
import FileSystem from "../filesystem";

class MkdirCommand extends Command {
    run = (args: string[], fileSystem: FileSystem): string => {
        if (args.length < 1) {
            return 'Usage: mkdir <directory1> [<directory2> ...]';
        }
        
        args.forEach(directory => {
            fileSystem.createDirectory(directory);
        });

        return '';
    }
}

export default MkdirCommand;